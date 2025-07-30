import 'dotenv/config';
import { Connection, WorkflowClient } from '@temporalio/client';
import { interviewSchedulingWorkflow, recruiterBookSlotSignal } from './workflows/interview-scheduling-workflow';
import { parseTimeSlot } from './nlp-parser';
import { v4 as uuidv4 } from 'uuid';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function startInterview() {
  const connection = await Connection.connect();
  const client = new WorkflowClient({ connection });
  
  console.log('\n=== Start New Interview Scheduling ===');
  const candidate = await ask('Enter candidate name: ');
  const candidateEmail = await ask('Enter candidate email: ');
  const interviewer = await ask('Enter interviewer name: ');
  const interviewerEmail = await ask('Enter interviewer email: ');
  
  // max round config - check
  console.log('\nNegotiation Rounds Configuration:');
  console.log('   • Each round allows 1 counter-proposal from candidate or interviewer');
  console.log('   • Higher rounds = more flexibility, but longer potential delays');
  console.log('   • System will timeout after 7 days OR max rounds (whichever first)');
  console.log('   • Recommended: 3-5 rounds for most interviews');
  
  let maxRounds: number;
  while (true) {
    const roundsInput = await ask('\nEnter maximum negotiation rounds (1-20, default: 14): ');
    
    if (roundsInput === '') {
      maxRounds = 14; // Default value
      console.log('Using default: 14 rounds');
      break;
    }
    
    const parsedRounds = parseInt(roundsInput, 10);
    if (isNaN(parsedRounds) || parsedRounds < 1 || parsedRounds > 20) {
      console.log('Please enter a valid number between 1 and 20.');
      continue;
    }
    
    maxRounds = parsedRounds;
    console.log(`Maximum rounds set to: ${maxRounds}`);
    break;
  }
  
  const workflowId = `interview-${uuidv4()}`;
  
  await client.start(interviewSchedulingWorkflow, {
    args: [{
      interviewId: workflowId,
      candidate,
      candidateEmail,
      interviewer,
      interviewerEmail,
      recruiter: 'System',
      recruiterEmail: process.env.GMAIL_USER || 'system@interview-scheduler.com',
      status: 'WAITING_FOR_INTERVIEWER_SLOTS',
      round: 1,
      maxRounds: maxRounds,
      startTime: Date.now()
    }],
    taskQueue: 'interview-scheduler',
    workflowId,
  });
  
  console.log(`\nInterview workflow started with ID: ${workflowId}`);
  console.log(`Configuration:`);
  console.log(`   • Candidate: ${candidate} (${candidateEmail})`);
  console.log(`   • Interviewer: ${interviewer} (${interviewerEmail})`);
  console.log(`   • Maximum negotiation rounds: ${maxRounds}`);
  console.log(`   • Timeout: 7 days OR ${maxRounds} rounds (whichever comes first)`);
  console.log('\nNow book a date for the interview...');
  
  return workflowId;
}

async function bookSlot(workflowId: string) {
  const connection = await Connection.connect();
  const client = new WorkflowClient({ connection });
  const handle = client.getHandle(workflowId);
  
  console.log('\n=== Book Interview Date ===');
  const dateInput = await ask('Enter interview date (e.g., "2024-07-25" or "Thursday" or "tomorrow"): ');
  
  const slot = await parseTimeSlot(dateInput);
  if (!slot || !slot.date) {
    console.log('Could not parse the date. Please try again with a clearer format.');
    return;
  }
  
  await handle.signal(recruiterBookSlotSignal, slot.date);
  console.log(`\nDate booked: ${slot.date}`);
  console.log('System will now:');
  console.log('1. Email interviewer asking for available slots on this date');
  console.log('2. Save interviewer\'s available slots');
  console.log('3. Email candidate with available slots');
  console.log('4. Wait for candidate to accept or request reschedule');
}

async function checkStatus(workflowId: string) {
  const connection = await Connection.connect();
  const client = new WorkflowClient({ connection });
  const handle = client.getHandle(workflowId);
  
  try {
    console.log(`\nChecking status for workflow: ${workflowId}`);
    console.log('Status: Active (check Temporal UI for detailed state)');
  } catch (error) {
    console.log('Error checking status:', error);
  }
}

async function mainMenu() {
  let currentWorkflowId: string | null = null;
  
  while (true) {
    console.log('\n==============================');
    console.log('RECRUITER INTERVIEW SCHEDULER');
    console.log('==============================');
    console.log('1. Start new interview (with custom round settings)');
    console.log('2. Book interview date');
    console.log('3. Check status');
    console.log('4. Exit');
    console.log('');
    console.log('Tip: Multi-round negotiation allows candidates and interviewers');
    console.log('   to counter-propose times until agreement or timeout.');
    
    const choice = await ask('Select an option (1-4): ');
    
    if (choice === '1') {
      currentWorkflowId = await startInterview();
    } else if (choice === '2') {
      if (!currentWorkflowId) {
        console.log('Please start an interview first (option 1).');
        continue;
      }
      await bookSlot(currentWorkflowId);
    } else if (choice === '3') {
      if (!currentWorkflowId) {
        console.log('Please start an interview first (option 1).');
        continue;
      }
      await checkStatus(currentWorkflowId);
    } else if (choice === '4') {
      break;
    } else {
      console.log('Invalid option. Please try again.');
    }
  }
  
  rl.close();
}

// running cli 
if (require.main === module) {
  mainMenu().catch(console.error);
} 