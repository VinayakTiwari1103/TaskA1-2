import fs from 'fs';

const SCHEDULED_FILE = 'scheduled-interviews.json';

export interface ScheduledInterview {
  interviewId: string;
  candidate: string;
  candidateEmail: string;
  interviewer: string;
  interviewerEmail: string;
  recruiter: string;
  recruiterEmail: string;
  scheduledDate: string;
  scheduledTime: string;
  calendarEventId?: string;
  meetLink?: string;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  createdAt: string;
}

function loadScheduledInterviews(): ScheduledInterview[] {
  if (!fs.existsSync(SCHEDULED_FILE)) {
    fs.writeFileSync(SCHEDULED_FILE, '[]', 'utf-8');
    return [];
  }
  try {
    const data = fs.readFileSync(SCHEDULED_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('Error reading scheduled interviews, creating new file');
    fs.writeFileSync(SCHEDULED_FILE, '[]', 'utf-8');
    return [];
  }
}

function saveScheduledInterviews(interviews: ScheduledInterview[]): void {
  fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(interviews, null, 2), 'utf-8');
}

export function saveScheduledInterview(interview: ScheduledInterview): void {
  const interviews = loadScheduledInterviews();
  const existingIndex = interviews.findIndex(i => i.interviewId === interview.interviewId);
  
  if (existingIndex >= 0) {
    interviews[existingIndex] = interview;
  } else {
    interviews.push(interview);
  }
  
  saveScheduledInterviews(interviews);
  console.log(`✅ Interview saved: ${interview.interviewId}`);
}

export function getScheduledInterview(interviewId: string): ScheduledInterview | null {
  const interviews = loadScheduledInterviews();
  return interviews.find(i => i.interviewId === interviewId) || null;
}

export function getAllScheduledInterviews(): ScheduledInterview[] {
  return loadScheduledInterviews();
}

export function updateInterviewCalendarInfo(
  interviewId: string, 
  calendarEventId: string, 
  meetLink?: string
): void {
  const interviews = loadScheduledInterviews();
  const interview = interviews.find(i => i.interviewId === interviewId);
  
  if (interview) {
    interview.calendarEventId = calendarEventId;
    interview.meetLink = meetLink;
    saveScheduledInterviews(interviews);
    console.log(`✅ Calendar info updated for interview: ${interviewId}`);
  } else {
    console.log(`❌ Interview not found: ${interviewId}`);
  }
}

export function cancelScheduledInterview(interviewId: string): void {
  const interviews = loadScheduledInterviews();
  const interview = interviews.find(i => i.interviewId === interviewId);
  
  if (interview) {
    interview.status = 'CANCELLED';
    saveScheduledInterviews(interviews);
    console.log(`✅ Interview cancelled: ${interviewId}`);
  } else {
    console.log(`❌ Interview not found: ${interviewId}`);
  }
}

// Functions for managing active interviews (for email monitoring)
export interface ActiveInterview {
  interviewId: string;
  status: string;
  candidate: string;
  candidateEmail: string;
  interviewer: string;
  interviewerEmail: string;
  proposedDate: string;
}

function loadActiveInterviews(): ActiveInterview[] {
  if (!fs.existsSync(SCHEDULED_FILE)) {
    fs.writeFileSync(SCHEDULED_FILE, '[]', 'utf-8');
    return [];
  }
  try {
    const data = fs.readFileSync(SCHEDULED_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('Error reading active interviews, creating new file');
    fs.writeFileSync(SCHEDULED_FILE, '[]', 'utf-8');
    return [];
  }
}

function saveActiveInterviews(interviews: ActiveInterview[]): void {
  fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(interviews, null, 2), 'utf-8');
}

export function addActiveInterview(interview: ActiveInterview): void {
  const interviews = loadActiveInterviews();
  const existingIndex = interviews.findIndex(i => i.interviewId === interview.interviewId);
  
  if (existingIndex >= 0) {
    interviews[existingIndex] = interview;
    console.log(`🔄 Updated active interview: ${interview.interviewId}`);
  } else {
    interviews.push(interview);
    console.log(`➕ Added active interview: ${interview.interviewId}`);
  }
  
  saveActiveInterviews(interviews);
}

export function updateActiveInterviewStatus(interviewId: string, status: string): void {
  const interviews = loadActiveInterviews();
  const interview = interviews.find(i => i.interviewId === interviewId);
  
  if (interview) {
    interview.status = status;
    saveActiveInterviews(interviews);
    console.log(`🔄 Updated interview status: ${interviewId} -> ${status}`);
  } else {
    console.log(`❌ Active interview not found: ${interviewId}`);
  }
}

export function removeActiveInterview(interviewId: string): void {
  const interviews = loadActiveInterviews();
  const filteredInterviews = interviews.filter(i => i.interviewId !== interviewId);
  
  if (interviews.length !== filteredInterviews.length) {
    saveActiveInterviews(filteredInterviews);
    console.log(`🗑️ Removed active interview: ${interviewId}`);
  } else {
    console.log(`❌ Active interview not found: ${interviewId}`);
  }
}

export function getActiveInterviews(): ActiveInterview[] {
  return loadActiveInterviews();
} 