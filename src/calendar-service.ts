import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs';

const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

async function authenticateGoogle() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      oAuth2Client.setCredentials(tokens);
      
      try {
        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
        await calendar.calendarList.list();
        console.log('Calendar token is valid');
        return oAuth2Client;
      } catch (error) {
        console.log('Calendar token expired, need to re-authenticate');
        fs.unlinkSync(TOKEN_PATH);
      }
    } catch (error) {
      console.log('Invalid calendar token file, need to re-authenticate');
      fs.unlinkSync(TOKEN_PATH);
    }
  }
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Google Calendar Authentication Required');
  console.log('Please visit this URL to authorize the app:');
  console.log(authUrl);
  console.log('After authorization, copy the code from the URL and paste it below.');
  
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code: string = await new Promise(resolve => rl.question('Enter the authorization code: ', (answer: string) => {
    rl.close(); resolve(answer.trim());
  }));
  
  try {
    const tokenResponse = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokenResponse.tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenResponse.tokens));
    console.log('Calendar authentication successful! Token saved.');
    return oAuth2Client;
  } catch (error) {
    console.error('Calendar authentication failed', error);
    throw error;
  }
}

export async function createInterviewEvent(
  candidateName: string,
  candidateEmail: string,
  interviewerName: string,
  interviewerEmail: string,
  date: string,
  startTime: string,
  endTime: string,
  interviewId: string
) {
  const auth = await authenticateGoogle();
  const calendar = google.calendar({ version: 'v3', auth });
  
  if (!date || !startTime || !endTime) {
    throw new Error(`Invalid date/time parameters: date=${date}, startTime=${startTime}, endTime=${endTime}`);
  }
  
  const [year, month, day] = date.split('-').map(Number);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  const startDateTime = new Date(year, month - 1, day, startHour, startMinute);
  const endDateTime = new Date(year, month - 1, day, endHour, endMinute);
  
  const event = {
    summary: `Interview: ${candidateName} with ${interviewerName}`,
    description: `Interview for ${candidateName} with ${interviewerName}\nInterview ID: ${interviewId}`,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: 'Asia/Kolkata',
    },
    attendees: [
      { email: candidateEmail, displayName: candidateName },
      { email: interviewerEmail, displayName: interviewerName },
    ],
    conferenceData: {
      createRequest: {
        requestId: `meet-${interviewId}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet'
        }
      }
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 24 hr phalay
        { method: 'popup', minutes: 15 }, // 15 min baad
      ],
    },
  };
  
  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: 1,
    });
    
    const createdEvent = response.data;
    const meetLink = createdEvent.conferenceData?.entryPoints?.[0]?.uri;
    
    console.log('Interview event created successfully!');
    console.log('Event ID:', createdEvent.id);
    console.log('Meet Link:', meetLink || 'No meet link generated');
    
    return {
      eventId: createdEvent.id,
      meetLink: meetLink,
      eventLink: createdEvent.htmlLink
    };
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    throw error;
  }
}

export async function updateInterviewEvent(
  eventId: string,
  candidateName: string,
  candidateEmail: string,
  interviewerName: string,
  interviewerEmail: string,
  date: string,
  startTime: string,
  endTime: string,
  interviewId: string
) {
  const auth = await authenticateGoogle();
  const calendar = google.calendar({ version: 'v3', auth });
  
  // Parse date and time
  const [year, month, day] = date.split('-').map(Number);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  const startDateTime = new Date(year, month - 1, day, startHour, startMinute);
  const endDateTime = new Date(year, month - 1, day, endHour, endMinute);
  
  const event = {
    summary: `Interview: ${candidateName} with ${interviewerName}`,
    description: `Interview for ${candidateName} with ${interviewerName}\nInterview ID: ${interviewId}`,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: 'Asia/Kolkata',
    },
    attendees: [
      { email: candidateEmail, displayName: candidateName },
      { email: interviewerEmail, displayName: interviewerName },
    ],
  };
  
  try {
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: event,
    });
    
    console.log('Interview event updated successfully!');
    return {
      eventId: response.data.id,
      eventLink: response.data.htmlLink
    };
  } catch (error) {
    console.error('Failed to update calendar event:', error);
    throw error;
  }
}

export async function cancelInterviewEvent(eventId: string) {
  const auth = await authenticateGoogle();
  const calendar = google.calendar({ version: 'v3', auth });
  
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    console.log('Interview event cancelled successfully!');
  } catch (error) {
    console.error('Failed to cancel calendar event:', error);
    throw error;
  }
} 