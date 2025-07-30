import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
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

// New function for simple slot confirmation (ACCEPT/REJECT)
export async function sendInterviewerSlotConfirmationEmail(
  interviewerEmail: string,
  interviewerName: string,
  candidateName: string,
  requestedSlot: string,
  interviewId: string
) {
  try {
    console.log(`Sending slot confirmation request to ${interviewerEmail}`);
    
    const auth = await authenticateGmail();
    const gmail = google.gmail({ version: 'v1', auth });
    
    const subject = `Slot Confirmation Required - ${candidateName} requests ${requestedSlot} [ID:${interviewId}]`;
    
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 2px 8px #0001;">
        <h2 style="color:#1976d2;">Slot Confirmation Request</h2>
        <p>Dear <b>${interviewerName}</b>,</p>
        <p>Candidate <b>${candidateName}</b> has requested the following interview slot:</p>
        
        <div style="background:#e3f2fd;padding:16px;border-radius:8px;margin:20px 0;border-left:4px solid #1976d2;">
          <h3 style="margin:0;color:#1976d2;">Requested Slot:</h3>
          <p style="font-size:1.1rem;margin:8px 0;"><b>${requestedSlot}</b></p>
        </div>
        
        <p><b>Please reply to this email with one of the following:</b></p>
        <div style="background:#f8f9fa;padding:16px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;"><b>To ACCEPT:</b> Reply with "<b>ACCEPT</b>"</p>
          <p style="margin:8px 0 0 0;"><b>To REJECT:</b> Reply with "<b>REJECT</b>"</p>
        </div>
        
        <p><small><i>InterviewID: ${interviewId}</i></small></p>
        <p style="margin-top:32px;">Best regards,<br/>Interview Scheduler System</p>
      </div>
    `;
    
    const message = [
      `From: ${process.env.GMAIL_USER}`,
      `To: ${interviewerEmail}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody
    ].join('\n');
    
    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    
    console.log(`Sent slot confirmation request to ${interviewerEmail} for InterviewID: ${interviewId}`);
  } catch (error) {
    console.error(`Failed to send slot confirmation email:`, error);
    throw error;
  }
}

export async function sendInterviewerRequestEmail(
  interviewerEmail: string,
  interviewerName: string,
  candidateName: string,
  proposedDate: string,
  interviewId: string
) {
  try {
    console.log(`Attempting to send interviewer request email to ${interviewerEmail}`);
    
    const auth = await authenticateGmail();
    const gmail = google.gmail({ version: 'v1', auth });
    
    const subject = `Interview Request - Available Slots for ${candidateName} on ${proposedDate} [InterviewID:${interviewId}]`;
    
    // HTML form link with proposed date
    const formUrl = `http://localhost:8087/slot-form?token=${encodeURIComponent(interviewId)}&interviewer=${encodeURIComponent(interviewerName)}&date=${encodeURIComponent(proposedDate)}`;
    
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 2px 8px #0001;">
        <h2 style="color:#1976d2;">Interview Request</h2>
        <p>Dear <b>${interviewerName}</b>,</p>
        <p>We have an interview request for candidate <b>${candidateName}</b> on <b>${proposedDate}</b>.</p>
        <p>Please provide your available time slots for this specific date by clicking the button below:</p>
        <p style="text-align:center;margin:32px 0;">
          <a href="${formUrl}" style="background:#1976d2;color:#fff;padding:14px 32px;text-decoration:none;font-size:1.1rem;border-radius:6px;display:inline-block;">Submit Available Time Slots</a>
        </p>
        <p><small>If the button doesn't work, copy and paste this link into your browser:<br/>
          <a href="${formUrl}">${formUrl}</a></small>
        </p>
        <div style="background:#f5f5f5;padding:16px;border-radius:4px;margin:20px 0;">
          <p><strong>Instructions:</strong></p>
          <ul>
            <li>You only need to provide time slots (the date is already set to ${proposedDate})</li>
            <li>Please provide at least one available time slot</li>
            <li>You can provide up to 3 different time slots for flexibility</li>
          </ul>
        </div>
        <p style="margin-top:32px;">Best regards,<br/>Interview Scheduler System</p>
      </div>
    `;
    
    const message = [
      `From: ${process.env.GMAIL_USER}`,
      `To: ${interviewerEmail}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody
    ].join('\n');
    
    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    
    console.log(`Sent interviewer request email to ${interviewerEmail} for InterviewID: ${interviewId}`);
  } catch (error) {
    console.error(`Failed to send interviewer request email:`, error);
    throw error;
  }
}

export async function sendCandidateSlotsEmail(
  candidateEmail: string,
  candidateName: string,
  interviewerName: string,
  availableSlots: Array<{date: string, startTime: string, endTime: string}>,
  interviewId: string
) {
  const auth = await authenticateGmail();
  const gmail = google.gmail({ version: 'v1', auth });
  
  const slotsList = availableSlots.map(slot => 
    `- ${slot.date} ${slot.startTime}-${slot.endTime}`
  ).join('\n');
  
  const subject = `Interview Slots Available - Please Select or Request Reschedule [InterviewID:${interviewId}]`;
  
  const body = `
Dear ${candidateName},

${interviewerName} has provided the following available time slots for your interview:

${slotsList}

Please reply to this email with:
1. Your preferred slot (e.g., "I accept 2024-07-25 10:00-11:00")
2. Or request reschedule with a new date (e.g., "Please reschedule to 2024-07-26")

Best regards,
Interview Scheduler System
  `.trim();
  
  const message = [
    `From: ${process.env.GMAIL_USER}`,
    `To: ${candidateEmail}`,
    `Subject: ${subject}`,
    '',
    body
  ].join('\n');
  
  const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage
    }
  });
  
  console.log(`Sent candidate slots email to ${candidateEmail} for InterviewID: ${interviewId}`);
}

export async function sendInterviewConfirmationEmail(
  candidateEmail: string,
  candidateName: string,
  interviewerEmail: string,
  interviewerName: string,
  selectedSlot: {date: string, startTime: string, endTime: string},
  interviewId: string,
  meetLink?: string
) {
  const auth = await authenticateGmail();
  const gmail = google.gmail({ version: 'v1', auth });
  
  const subject = `Interview Confirmed - ${selectedSlot.date} ${selectedSlot.startTime}-${selectedSlot.endTime} [InterviewID:${interviewId}]`;
  
  const meetLinkText = meetLink ? `\n\nGoogle Meet Link: ${meetLink}` : '';
  
  const body = `
Dear ${candidateName} and ${interviewerName},

Your interview has been confirmed for:
Date: ${selectedSlot.date}
Time: ${selectedSlot.startTime}-${selectedSlot.endTime}${meetLinkText}

Please ensure you are available at this time.

Best regards,
Interview Scheduler System
  `.trim();
  
  const message = [
    `From: ${process.env.GMAIL_USER}`,
    `To: ${candidateEmail}, ${interviewerEmail}`,
    `Subject: ${subject}`,
    '',
    body
  ].join('\n');
  
  const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage
    }
  });
  
  console.log(`Sent interview confirmation email for InterviewID: ${interviewId}`);
} 

// New function to notify candidate when slot is rejected
export async function sendCandidateSlotRejectedEmail(
  candidateEmail: string,
  candidateName: string,
  interviewerName: string,
  rejectedSlot: string,
  interviewId: string
) {
  try {
    console.log(`Sending slot rejection notification to ${candidateEmail}`);
    
    const auth = await authenticateGmail();
    const gmail = google.gmail({ version: 'v1', auth });
    
    const subject = `Slot Not Available - Please Choose Different Time [ID:${interviewId}]`;
    
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 2px 8px #0001;">
        <h2 style="color:#f44336;">Slot Not Available</h2>
        <p>Dear <b>${candidateName}</b>,</p>
        <p>Unfortunately, <b>${interviewerName}</b> is not available for the requested slot:</p>
        
        <div style="background:#ffebee;padding:16px;border-radius:8px;margin:20px 0;border-left:4px solid #f44336;">
          <p style="margin:0;color:#c62828;"><b>Unavailable Slot:</b> ${rejectedSlot}</p>
        </div>
        
        <p><b>Please reply to this email with a different time preference.</b></p>
        
        <div style="background:#f8f9fa;padding:16px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;"><b>How to respond:</b></p>
          <p style="margin:8px 0 0 0;">Reply with your new preferred time, for example:</p>
          <p style="margin:8px 0 0 0;font-style:italic;">"Please reschedule to 2025-07-31 14:00-15:00"</p>
        </div>
        
        <p><small><i>InterviewID: ${interviewId}</i></small></p>
        <p style="margin-top:32px;">Best regards,<br/>Interview Scheduler System</p>
      </div>
    `;
    
    const message = [
      `From: ${process.env.GMAIL_USER}`,
      `To: ${candidateEmail}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody
    ].join('\n');
    
    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    
    console.log(`Sent slot rejection notification to ${candidateEmail} for InterviewID: ${interviewId}`);
  } catch (error) {
    console.error(`Failed to send slot rejection email:`, error);
    throw error;
  }
}