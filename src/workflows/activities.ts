import { sendInterviewerRequestEmail, sendCandidateSlotsEmail, sendInterviewConfirmationEmail, sendInterviewerSlotConfirmationEmail, sendCandidateSlotRejectedEmail } from '../email-service';
import { createInterviewEvent } from '../calendar-service';
import { addActiveInterview as addActiveInterviewFn, updateActiveInterviewStatus as updateActiveInterviewStatusFn, removeActiveInterview as removeActiveInterviewFn, ActiveInterview } from '../interview-storage';

export async function sendInterviewerRequest({ interviewerEmail, interviewerName, candidateName, proposedDate, interviewId }: {
  interviewerEmail: string;
  interviewerName: string;
  candidateName: string;
  proposedDate: string;
  interviewId: string;
}) {
  await sendInterviewerRequestEmail(interviewerEmail, interviewerName, candidateName, proposedDate, interviewId);
}

export async function sendCandidateSlots({ candidateEmail, candidateName, interviewerName, availableSlots, interviewId }: {
  candidateEmail: string;
  candidateName: string;
  interviewerName: string;
  availableSlots: Array<{ date: string; startTime: string; endTime: string }>;
  interviewId: string;
}) {
  await sendCandidateSlotsEmail(candidateEmail, candidateName, interviewerName, availableSlots, interviewId);
}

export async function sendInterviewConfirmation({ candidateEmail, candidateName, interviewerEmail, interviewerName, selectedSlot, interviewId, meetLink }: {
  candidateEmail: string;
  candidateName: string;
  interviewerEmail: string;
  interviewerName: string;
  selectedSlot: { date: string; startTime: string; endTime: string };
  interviewId: string;
  meetLink?: string;
}) {
  await sendInterviewConfirmationEmail(candidateEmail, candidateName, interviewerEmail, interviewerName, selectedSlot, interviewId, meetLink);
}

export async function createCalendarEvent({ candidateName, candidateEmail, interviewerName, interviewerEmail, date, startTime, endTime, interviewId }: {
  candidateName: string;
  candidateEmail: string;
  interviewerName: string;
  interviewerEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  interviewId: string;
}) {
  return await createInterviewEvent(candidateName, candidateEmail, interviewerName, interviewerEmail, date, startTime, endTime, interviewId);
}

export async function addActiveInterview(interview: ActiveInterview) {
  addActiveInterviewFn(interview);
}

export async function updateActiveInterviewStatus(interviewId: string, status: string) {
  updateActiveInterviewStatusFn(interviewId, status);
}

export async function removeActiveInterview(interviewId: string) {
  removeActiveInterviewFn(interviewId);
} 

export async function sendInterviewerSlotConfirmation({ interviewerEmail, interviewerName, candidateName, requestedSlot, interviewId }: {
  interviewerEmail: string;
  interviewerName: string;
  candidateName: string;
  requestedSlot: string;
  interviewId: string;
}) {
  await sendInterviewerSlotConfirmationEmail(interviewerEmail, interviewerName, candidateName, requestedSlot, interviewId);
}

export async function sendCandidateSlotRejected({ candidateEmail, candidateName, interviewerName, rejectedSlot, interviewId }: {
  candidateEmail: string;
  candidateName: string;
  interviewerName: string;
  rejectedSlot: string;
  interviewId: string;
}) {
  await sendCandidateSlotRejectedEmail(candidateEmail, candidateName, interviewerName, rejectedSlot, interviewId);
}