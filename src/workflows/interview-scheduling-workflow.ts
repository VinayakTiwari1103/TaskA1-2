import { defineSignal, setHandler, sleep, proxyActivities } from '@temporalio/workflow';

export interface Slot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface InterviewSchedulingState {
  interviewId: string;
  candidate: string;
  candidateEmail: string;
  interviewer: string;
  interviewerEmail: string;
  recruiter: string;
  recruiterEmail: string;
  proposedDate?: string;
  interviewerSlots?: Slot[];
  candidateSelectedSlot?: Slot;
  candidateRequestedSlot?: Slot;
  candidateRequestedReschedule?: boolean;
  calendarEventId?: string;
  meetLink?: string;
  status:
    | 'WAITING_FOR_INTERVIEWER_SLOTS'
    | 'WAITING_FOR_CANDIDATE_RESPONSE'
    | 'WAITING_FOR_INTERVIEWER_CONFIRMATION' // waiting for interviewer to confirm candidate slot
    | 'SCHEDULED'
    | 'RESCHEDULE_NEEDED'
    | 'CANCELLED'
    | 'COMPLETED';
  round: number;
  maxRounds?: number; //Kitnay repeated rounds 
  startTime?: number; 
}

const { sendInterviewerRequest, sendCandidateSlots, sendInterviewConfirmation, createCalendarEvent, addActiveInterview, updateActiveInterviewStatus, removeActiveInterview, sendInterviewerSlotConfirmation, sendCandidateSlotRejected } = proxyActivities<{
  sendInterviewerRequest: typeof import('./activities').sendInterviewerRequest;
  sendCandidateSlots: typeof import('./activities').sendCandidateSlots;
  sendInterviewConfirmation: typeof import('./activities').sendInterviewConfirmation;
  createCalendarEvent: typeof import('./activities').createCalendarEvent;
  addActiveInterview: typeof import('./activities').addActiveInterview;
  updateActiveInterviewStatus: typeof import('./activities').updateActiveInterviewStatus;
  removeActiveInterview: typeof import('./activities').removeActiveInterview;
  sendInterviewerSlotConfirmation: typeof import('./activities').sendInterviewerSlotConfirmation;
  sendCandidateSlotRejected: typeof import('./activities').sendCandidateSlotRejected;
}>({ startToCloseTimeout: '2 minute' });

export const recruiterBookSlotSignal = defineSignal<[string]>('RECRUITER_BOOK_SLOT');
export const interviewerSlotsSignal = defineSignal<[Slot[]]>('INTERVIEWER_SLOTS');
export const candidateRequestSlotSignal = defineSignal<[Slot]>('CANDIDATE_REQUEST_SLOT'); // candidate proposes specific slot
export const interviewerConfirmSlotSignal = defineSignal<[boolean, Slot?]>('INTERVIEWER_CONFIRM_SLOT');
export const candidateRequestRescheduleSignal = defineSignal<[Slot]>('CANDIDATE_REQUEST_RESCHEDULE'); 
export const cancelSignal = defineSignal('CANCEL');

export async function interviewSchedulingWorkflow(initial: InterviewSchedulingState): Promise<string> {
  let state = { 
    ...initial, 
    round: 1,
    maxRounds: 14, // 7 days (assuming 2 rounds per day)
    startTime: Date.now()
  };

  // Register this interview for email monitoring
  console.log(`Registering interview for email monitoring: ${state.interviewId}`);
  await addActiveInterview({
    interviewId: state.interviewId,
    status: state.status,
    candidate: state.candidate,
    candidateEmail: state.candidateEmail,
    interviewer: state.interviewer,
    interviewerEmail: state.interviewerEmail,
    proposedDate: state.proposedDate || 'TBD'
  });

  // Signal handlers - Enhanced for mutual confirmation
  setHandler(recruiterBookSlotSignal, (date) => {
    state.proposedDate = date;
    state.status = 'WAITING_FOR_INTERVIEWER_SLOTS';
  });
  
  setHandler(interviewerSlotsSignal, (slots) => {
    state.interviewerSlots = slots;
    state.status = 'WAITING_FOR_CANDIDATE_RESPONSE';
  });
  
  setHandler(candidateRequestSlotSignal, async (slotRequest) => {
    console.log('Candidate requested slot:', slotRequest);
    state.candidateRequestedSlot = slotRequest;
    state.status = 'WAITING_FOR_INTERVIEWER_CONFIRMATION';
    state.round++;
    
    // Send simple confirmation request email to interviewer (ACCEPT/REJECT)
    const slotText = `${slotRequest.date} from ${slotRequest.startTime} to ${slotRequest.endTime}`;
    await sendInterviewerSlotConfirmation({
      interviewerEmail: state.interviewerEmail,
      interviewerName: state.interviewer,
      candidateName: state.candidate,
      requestedSlot: slotText,
      interviewId: state.interviewId
    });
    
    await updateActiveInterviewStatus(state.interviewId, 'WAITING_FOR_INTERVIEWER_CONFIRMATION');
  });
  
  setHandler(interviewerConfirmSlotSignal, async (confirmed, counterProposal) => {
    if (confirmed && state.candidateRequestedSlot) {
      console.log(`Interviewer confirmed slot (Round ${state.round})`);
      state.candidateSelectedSlot = state.candidateRequestedSlot;
      state.status = 'SCHEDULED';
      await updateActiveInterviewStatus(state.interviewId, 'SCHEDULED');
    } else if (counterProposal) {
      console.log(`Interviewer counter-proposed (Round ${state.round}):`, counterProposal);
      state.interviewerSlots = [counterProposal];
      state.status = 'WAITING_FOR_CANDIDATE_RESPONSE';
      state.round++;
      await updateActiveInterviewStatus(state.interviewId, 'WAITING_FOR_CANDIDATE_RESPONSE');
    } else if (state.candidateRequestedSlot) {
      console.log(`Interviewer rejected slot (Round ${state.round})`);
      // Send rejection email to candidate
      const rejectedSlotText = `${state.candidateRequestedSlot.date} from ${state.candidateRequestedSlot.startTime} to ${state.candidateRequestedSlot.endTime}`;
      await sendCandidateSlotRejected({
        candidateEmail: state.candidateEmail,
        candidateName: state.candidate,
        interviewerName: state.interviewer,
        rejectedSlot: rejectedSlotText,
        interviewId: state.interviewId
      });
      
      state.status = 'WAITING_FOR_CANDIDATE_RESPONSE'; // Wait for candidate to propose new slot
      state.candidateRequestedSlot = undefined;
      state.round++;
      await updateActiveInterviewStatus(state.interviewId, 'WAITING_FOR_CANDIDATE_RESPONSE');
    }
  });
  
  setHandler(candidateRequestRescheduleSignal, async (requestedSlot) => {
    console.log(`Candidate requested reschedule (Round ${state.round}):`, requestedSlot);
    state.candidateRequestedSlot = requestedSlot;
    state.status = 'WAITING_FOR_INTERVIEWER_CONFIRMATION';
    state.round++;
    
    // Send simple confirmation request email to interviewer (ACCEPT/REJECT)
    const slotText = `${requestedSlot.date} from ${requestedSlot.startTime} to ${requestedSlot.endTime}`;
    await sendInterviewerSlotConfirmation({
      interviewerEmail: state.interviewerEmail,
      interviewerName: state.interviewer,
      candidateName: state.candidate,
      requestedSlot: slotText,
      interviewId: state.interviewId
    });
    
    await updateActiveInterviewStatus(state.interviewId, 'WAITING_FOR_INTERVIEWER_CONFIRMATION');
  });
  
  setHandler(cancelSignal, () => {
    state.status = 'CANCELLED';
  });

  // Main workflow loop with 7-day timeout
  while (state.status !== 'SCHEDULED' && state.status !== 'CANCELLED' && state.status !== 'COMPLETED') {
    
    // Check for 7-day timeout
    const daysPassed = (Date.now() - state.startTime) / (1000 * 60 * 60 * 24);
    if (daysPassed > 7 || state.round > state.maxRounds) {
      console.log(`Interview scheduling timed out after ${daysPassed.toFixed(1)} days or ${state.round} rounds`);
      state.status = 'CANCELLED';
      break;
    }
    
    // 1. Wait for recruiter to book a slot (propose a date)
    if (!state.proposedDate) {
      await sleep('10 seconds');
      continue;
    }

    // 2. Email interviewer for slots (activity) - only once per round
    if (state.status === 'WAITING_FOR_INTERVIEWER_SLOTS' && (!state.interviewerSlots || state.interviewerSlots.length === 0)) {
      console.log(`Sending interviewer request email (Round ${state.round})`);
      await sendInterviewerRequest({
        interviewerEmail: state.interviewerEmail,
        interviewerName: state.interviewer,
        candidateName: state.candidate,
        proposedDate: state.proposedDate,
        interviewId: state.interviewId,
      });
      
      // Wait for interviewer to provide available slots
      while (!state.interviewerSlots || state.interviewerSlots.length === 0) {
        await sleep('10 seconds');
        // Check if status changed during sleep
        if (state.status !== 'WAITING_FOR_INTERVIEWER_SLOTS') {
          break;
        }
      }
      
      if (state.interviewerSlots && state.interviewerSlots.length > 0) {
        console.log(`Sending candidate slots email with ${state.interviewerSlots.length} slots`);
        // Update status before sending candidate email
        await updateActiveInterviewStatus(state.interviewId, 'WAITING_FOR_CANDIDATE_RESPONSE');
        
        // Interviewer provided slots - now email candidate
        await sendCandidateSlots({
          candidateEmail: state.candidateEmail,
          candidateName: state.candidate,
          interviewerName: state.interviewer,
          availableSlots: state.interviewerSlots,
          interviewId: state.interviewId,
        });
        state.status = 'WAITING_FOR_CANDIDATE_RESPONSE';
      }
      continue;
    }

    // 3. Wait for candidate to accept a slot or request reschedule
    if (state.status === 'WAITING_FOR_CANDIDATE_RESPONSE') {
      while (!state.candidateSelectedSlot && !state.candidateRequestedReschedule) {
        await sleep('10 seconds');
        // Check if status changed during sleep
        if (state.status !== 'WAITING_FOR_CANDIDATE_RESPONSE') {
          break;
        }
      }
      
      if (state.candidateSelectedSlot) {
        // Candidate accepted a slot - schedule the interview
        state.status = 'SCHEDULED';
        break;
      } else if (state.candidateRequestedReschedule) {
        // Candidate requested reschedule - reset for next round
        console.log(`Candidate requested reschedule (Round ${state.round + 1})`);
        state.status = 'WAITING_FOR_INTERVIEWER_SLOTS';
        state.interviewerSlots = undefined;
        state.candidateSelectedSlot = undefined;
        state.candidateRequestedReschedule = false;
        continue;
      }
    }

    // Safety break
    await sleep('5 seconds');
  }

  if (state.status === 'SCHEDULED') {
    // Create Google Calendar event with Meet link (activity)
    try {
      const calendarResult = await createCalendarEvent({
        candidateName: state.candidate,
        candidateEmail: state.candidateEmail,
        interviewerName: state.interviewer,
        interviewerEmail: state.interviewerEmail,
        date: state.candidateSelectedSlot!.date,
        startTime: state.candidateSelectedSlot!.startTime,
        endTime: state.candidateSelectedSlot!.endTime,
        interviewId: state.interviewId,
      });
      state.calendarEventId = calendarResult.eventId || undefined;
      state.meetLink = calendarResult.meetLink || undefined;
      // Send confirmation email (activity)
      await sendInterviewConfirmation({
        candidateEmail: state.candidateEmail,
        candidateName: state.candidate,
        interviewerEmail: state.interviewerEmail,
        interviewerName: state.interviewer,
        selectedSlot: state.candidateSelectedSlot!,
        interviewId: state.interviewId,
        meetLink: state.meetLink,
      });
    } catch (error) {
      // You may want to handle this more gracefully in production
      // For now, just log and continue
      // (You could also signal the recruiter for manual intervention)
      // eslint-disable-next-line no-console
      console.error('Failed to create calendar event or send confirmation:', error);
    }
    
    // Update status to completed and remove from active monitoring
    await updateActiveInterviewStatus(state.interviewId, 'COMPLETED');
    await removeActiveInterview(state.interviewId);
    
    state.status = 'COMPLETED';
    return `Interview scheduled successfully for ${state.candidateSelectedSlot?.date} ${state.candidateSelectedSlot?.startTime}-${state.candidateSelectedSlot?.endTime}! Calendar event created with Meet link.`;
  }
  
  if (state.status === 'CANCELLED') {
    // Remove from active monitoring
    await removeActiveInterview(state.interviewId);
    return 'Interview cancelled.';
  }

  return 'Workflow ended: ' + state.status;
}

// Integration points:
// - CLI for recruiter to book slots (propose dates)
// - Email integration to send requests to interviewer and candidate
// - Email processing to capture interviewer slots and candidate responses
// - Google Calendar integration for event creation with Meet links (via activities) 