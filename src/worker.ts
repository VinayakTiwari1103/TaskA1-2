import 'dotenv/config';

import { Worker } from '@temporalio/worker';
import { google } from 'googleapis';
import fs from 'fs';
import { parseTimeSlot, parseConfirmationResponse } from './nlp-parser';
import { Connection, WorkflowClient } from '@temporalio/client';
import { interviewerSlotsSignal, candidateRequestSlotSignal, candidateRequestRescheduleSignal, interviewerConfirmSlotSignal } from './workflows/interview-scheduling-workflow';
import { getAllScheduledInterviews } from './interview-storage';
import { getActiveInterviews, removeActiveInterview } from './interview-storage';

const MAX_PARSE_ATTEMPTS = 3;

// Track processed email IDs to avoid duplicate check -- CHECK
const processedEmails = new Set<string>();

function convertSlotFormat(slot: any): any {
  if (!slot) return slot;
  return {
    date: slot.date,
    startTime: slot.start_time || slot.startTime,
    endTime: slot.end_time || slot.endTime
  };
}

async function sendInterviewerSlotsSignalToWorkflow(interviewId: string, slots: any[]) {
  try {
    const connection = await Connection.connect();
    const client = new WorkflowClient({ connection });
    const handle = client.getHandle(interviewId);
    await handle.signal(interviewerSlotsSignal, slots);
    console.log(`Sent interviewer slots signal to workflow ${interviewId}`);
  } catch (error: any) {
    if (error.message?.includes('workflow execution already completed')) {
      console.log(`Workflow ${interviewId} already completed, removing from active list`);
      console.log('working');
      removeActiveInterview(interviewId);
    } else {
      console.error(`Error sending interviewer slots signal to ${interviewId}:`, error.message);
    }
  }
}

async function sendCandidateRequestSlotSignalToWorkflow(interviewId: string, slot: any) {
  try {
    const connection = await Connection.connect();
    const client = new WorkflowClient({ connection });
    const handle = client.getHandle(interviewId);
    await handle.signal(candidateRequestSlotSignal, slot);
    console.log(`Sent candidate request slot signal to workflow ${interviewId}`, slot);
  } catch (error: any) {
    if (error.message?.includes('workflow execution already completed')) {
      console.log(`Workflow ${interviewId} already completed, removing from active list`);
      console.log('working sendCandidateRequestSlotSignalToWorkflow');
      removeActiveInterview(interviewId);
    } else {
      console.error(`Error sending candidate request slot signal to ${interviewId}:`, error.message);
    }
  }
}

async function sendInterviewerConfirmSlotSignalToWorkflow(interviewId: string, confirmed: boolean, counterProposal?: any) {
  try {
    const connection = await Connection.connect();
    const client = new WorkflowClient({ connection });
    const handle = client.getHandle(interviewId);
    await handle.signal(interviewerConfirmSlotSignal, confirmed, counterProposal);
    console.log(`Sent interviewer confirmation signal to workflow ${interviewId}:`, { confirmed, counterProposal });
  } catch (error: any) {
    if (error.message?.includes('workflow execution already completed')) {
      console.log(`Workflow ${interviewId} already completed, removing from active list`);
      removeActiveInterview(interviewId);
    } else {
      console.error(`Error sending interviewer confirmation signal to ${interviewId}:`, error.message);
    }
  }
}

async function sendCandidateRequestRescheduleSignalToWorkflow(interviewId: string, requestedSlot: any) {
  try {
    const connection = await Connection.connect();
    const client = new WorkflowClient({ connection });
    const handle = client.getHandle(interviewId);
    await handle.signal(candidateRequestRescheduleSignal, requestedSlot);
    console.log(`Sent candidate reschedule request signal to workflow ${interviewId}`, requestedSlot);
  } catch (error: any) {
    if (error.message?.includes('workflow execution already completed')) {
      console.log(`Workflow ${interviewId} already completed, removing from active list`);
      removeActiveInterview(interviewId);
    } else {
      console.error(`Error sending candidate reschedule signal to ${interviewId}:`, error.message);
    }
  }
}

function getScheduledInterviewIds() {
  const activeInterviews = getActiveInterviews();
  return activeInterviews.map(interview => interview.interviewId);
}

console.log('GOOGLE_CALENDAR_ID:', process.env.GOOGLE_CALENDAR_ID);

const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
];

async function authenticateGmail() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')));
    return oAuth2Client;
  }
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('[OAuth2] Authorize this app by visiting this url:', authUrl);
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code: string = await new Promise(resolve => rl.question('Enter the code from that page here: ', (answer: string) => {
    rl.close(); resolve(answer);
  }));
  const tokenResponse = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokenResponse.tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenResponse.tokens));
  return oAuth2Client;
}

async function checkForReplies() {
  console.log('Checking for email replies...');
  const auth = await authenticateGmail();
  const gmail = google.gmail({ version: 'v1', auth });
  const interviewIds = getScheduledInterviewIds();

  if (interviewIds.length === 0) {
    console.log('No active interviews to check');
    return;
  }

  console.log(`Checking ${interviewIds.length} active interview(s):`, interviewIds);

  for (const interviewId of interviewIds) {
    console.log(`Searching for emails related to InterviewID: ${interviewId}`);
    
    let res = await gmail.users.messages.list({
      userId: 'me',
      q: `"InterviewID:${interviewId}" is:unread`,
    });
    let messages = res.data.messages || [];
    
    if (messages.length === 0) {
      console.log(`No unread emails found, searching recent emails for InterviewID: ${interviewId}`);
      res = await gmail.users.messages.list({
        userId: 'me',
        q: `"InterviewID:${interviewId}" newer_than:2d`,
      });
      messages = res.data.messages || [];
      console.log(`Found ${messages.length} recent email(s) for InterviewID: ${interviewId}`);
    } else {
      console.log(`Found ${messages.length} unread email(s) for InterviewID: ${interviewId}`);
    }
  for (const msg of messages) {
    if (processedEmails.has(msg.id!)) {
      console.log(`Skipping already processed email: ${msg.id}`);
      continue;
    }
    
    const msgRes = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' });
    const headers = msgRes.data.payload?.headers || [];
    const subjectHeader = headers.find(h => h.name === 'Subject');
      const subject = subjectHeader?.value || '';
    const fromHeader = headers.find(h => h.name === 'From');
    const from = fromHeader?.value || '';
      console.log(`[DEBUG] Processing email for InterviewID ${interviewId}: Subject="${subject}" From="${from}"`);

    // ISSUE CHECK *************************************: Skip emails sent BY the system itself
    const systemEmail = 'tiwarivinayak10@gmail.com';
    if (from.includes(systemEmail)) {
      console.log(`Skipping email sent BY the system itself: From="${from}"`);
      continue;
    }

    let body = '';
    if (msgRes.data.payload?.parts) {
      const part = msgRes.data.payload.parts.find(p => p.mimeType === 'text/plain');
      if (part && part.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    } else if (msgRes.data.payload?.body?.data) {
      body = Buffer.from(msgRes.data.payload.body.data, 'base64').toString('utf-8');
    }

      if (!subject.includes(`[InterviewID:${interviewId}]`) && !body.includes(`[InterviewID:${interviewId}]`)) {
        console.log(`Email doesn't contain InterviewID marker, checking if it's a reply to interview email...`);
        if (!subject.toLowerCase().includes('interview')) {
          console.log(`Skipping unrelated email: Subject="${subject}" From="${from}"`);
          continue;
        }
      }

      console.log('Processing relevant email for InterviewID:', interviewId, `Subject="${subject}" From="${from}"`);
      
      processedEmails.add(msg.id!);      
      
      if (subject.includes('Slot Confirmation Required')) {
        console.log('Processing slot confirmation response from interviewer');
        
        //Don't process HTML email templates - only actual user replies
        if (body.includes('<div style=') || body.includes('font-family:Arial') || body.length > 2000) {
          console.log('Skipping HTML email template - waiting for actual user reply');
          continue;
        }
        
        const confirmation = parseConfirmationResponse(body);
        
        if (confirmation.type === 'ACCEPT') {
          console.log('Interviewer ACCEPTED the slot');
          await sendInterviewerConfirmSlotSignalToWorkflow(interviewId, true);
        } else if (confirmation.type === 'REJECT') {
          console.log('Interviewer REJECTED the slot');
          await sendInterviewerConfirmSlotSignalToWorkflow(interviewId, false);
        } else {
          console.log('Could not determine confirmation response, treating as rejection');
          await sendInterviewerConfirmSlotSignalToWorkflow(interviewId, false);
        }
      } else if (subject.includes('Interview Request') || subject.includes('Available Slots')) {
        console.log('Processing interviewer slots response');
        const slots = await parseInterviewerSlots(body);
        if (slots && slots.length > 0) {
          await sendInterviewerSlotsSignalToWorkflow(interviewId, slots);
        }
      } else if (subject.includes('Slot Not Available') || subject.includes('Interview Slots Available') || subject.includes('reschedule')) {
        console.log('Processing candidate response');
        const result = await parseCandidateResponse(body);
        
        if (result.requestedSlot) {
          console.log(`Candidate requested specific slot - awaiting interviewer confirmation:`, result.requestedSlot);
          await sendCandidateRequestSlotSignalToWorkflow(interviewId, result.requestedSlot);
        } else if (result.rescheduleSlot) {
          console.log(`Candidate requested reschedule - awaiting interviewer confirmation:`, result.rescheduleSlot);
          await sendCandidateRequestRescheduleSignalToWorkflow(interviewId, result.rescheduleSlot);
        }
      }
    }
  }
}

async function parseInterviewerConfirmation(body: string): Promise<{confirmed: boolean, counterProposal?: any}> {
  const lowerBody = body.toLowerCase();
  console.log('Parsing interviewer confirmation:', body.substring(0, 200));
  
  if (lowerBody.includes('confirm') || lowerBody.includes('approved') || lowerBody.includes('yes') || lowerBody.includes('perfect')) {
    console.log('Found confirmation keywords');
    return { confirmed: true };
  }
  
  // rejection patterns
  if (lowerBody.includes('reject') || lowerBody.includes('cannot') || lowerBody.includes('not available') || lowerBody.includes('no')) {
    console.log('Found rejection keywords');
    
    const slot = await parseTimeSlot(body);
    if (slot && slot.date) {
      console.log('Found counter-proposal:', slot);
      return { confirmed: false, counterProposal: slot };
    }
    
    return { confirmed: false };
  }
  
  console.log('Could not determine confirmation status');
  return { confirmed: false };
}

async function parseInterviewerSlots(body: string): Promise<any[]> {
  const lines = body.split('\n');
  const slots = [];
  
  for (const line of lines) {
    const cleanLine = line.trim();
    if (cleanLine.match(/\d{1,2}:\d{2}-\d{1,2}:\d{2}/)) {
      // Found a time slot pattern like "10:00-11:00" ---  need more check and fixes 
      const timeMatch = cleanLine.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
      if (timeMatch) {
        slots.push({
          startTime: timeMatch[1],
          endTime: timeMatch[2],
          date: new Date().toISOString().split('T')[0]
        });
      }
    }
  }
  
  return slots;
}

async function parseCandidateResponse(body: string): Promise<{acceptedSlot?: any, rescheduleDate?: string, requestedSlot?: any, rescheduleSlot?: any}> {
  const lowerBody = body.toLowerCase();
  console.log('Parsing candidate response:', body.substring(0, 200));
  
  if (lowerBody.includes('request') || lowerBody.includes('propose') || lowerBody.includes('would like') || lowerBody.includes('prefer')) {
    console.log('Found slot request keywords');
    
    const slot = await parseTimeSlot(body);
    if (slot && slot.date) {
      const convertedSlot = convertSlotFormat(slot);
      console.log('Parsed requested slot:', convertedSlot);
      return { requestedSlot: convertedSlot };
    }
  }
  
  if (lowerBody.includes('reschedule') || lowerBody.includes('please reschedule')) {
    console.log('Found reschedule keywords in response');
    
    const slot = await parseTimeSlot(body);
    if (slot && slot.date) {
      const convertedSlot = convertSlotFormat(slot);
      console.log('Parsed reschedule slot:', convertedSlot);
      return { rescheduleSlot: convertedSlot };
    }
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const defaultDate = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
    console.log('Using fallback reschedule date (tomorrow):', defaultDate);
    return { rescheduleDate: defaultDate };
  }
  
  if (lowerBody.includes('accept') || lowerBody.includes('i accept') || lowerBody.includes('thank you')) {
    console.log('Found acceptance keywords in response');
    
    const lines = body.split('\n');
    for (const line of lines) {
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
      const timeMatch = line.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
      
      if (dateMatch && timeMatch) {
        const acceptedSlot = {
          date: dateMatch[1],
          startTime: timeMatch[1],
          endTime: timeMatch[2]
        };
        console.log('Parsed accepted slot:', acceptedSlot);
        return { acceptedSlot };
      }
    }
    
    // Agar hum specific slot nahi nikal pa rahe hain,-tab change 
    // Jaise ki, On 2025-07-29 from 12:01 to 13:00" ya phir koi aisa human-friendly format .
    const slotMatch = body.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
    if (slotMatch) {
      const acceptedSlot = {
        date: slotMatch[1],
        startTime: slotMatch[2],
        endTime: slotMatch[3]
      };
      console.log('Parsed accepted slot from general pattern:', acceptedSlot);
      return { acceptedSlot };
    }
  }
  
  console.log('Could not parse candidate response');
  return {};
}

async function run() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows/interview-scheduling-workflow'),
    activities: require('./workflows/activities'),
    taskQueue: 'interview-scheduler',
  });
  
  startEmailMonitoring();
  
  await worker.run();
}

async function startEmailMonitoring() {
  console.log('Starting continuous email monitoring...');
  
  const checkEmails = async () => {
    try {
      await checkForReplies();
    } catch (error) {
      console.error('Error checking emails:', error);
    }
  };
  
  await checkEmails();
  
  setInterval(checkEmails, 30000);
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} 