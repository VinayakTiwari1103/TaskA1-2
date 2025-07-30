import 'dotenv/config';
import { getAllScheduledInterviews, cancelScheduledInterview } from './interview-storage';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function viewInterviews() {
  console.log('\n=== Scheduled Interviews ===\n');
  
  const interviews = getAllScheduledInterviews();
  
  if (interviews.length === 0) {
    console.log('No scheduled interviews found.');
    console.log('Use the recruiter CLI to schedule interviews.');
    return;
  }
  
  interviews.forEach((interview, index) => {
    console.log(`${index + 1}. Interview ID: ${interview.interviewId}`);
    console.log(`Candidate: ${interview.candidate} (${interview.candidateEmail})`);
    console.log(`Interviewer: ${interview.interviewer} (${interview.interviewerEmail})`);
    console.log(`Date: ${interview.scheduledDate}`);
    console.log(`Time: ${interview.scheduledTime}`);
    console.log(`Status: ${interview.status}`);
    
    if (interview.calendarEventId) {
      console.log(`Calendar Event ID: ${interview.calendarEventId}`);
    }
    
    if (interview.meetLink) {
      console.log(` Meet Link: ${interview.meetLink}`);
    }
    
    console.log(`   Created: ${interview.createdAt}`);
    console.log('');
  });
}

async function cancelInterview() {
  console.log('\n=== Cancel Interview ===\n');
  
  const interviews = getAllScheduledInterviews().filter(i => i.status === 'SCHEDULED');
  
  if (interviews.length === 0) {
    console.log('No active interviews to cancel.');
    return;
  }
  
  console.log('Active interviews:');
  interviews.forEach((interview, index) => {
    console.log(`${index + 1}. ${interview.candidate} with ${interview.interviewer} on ${interview.scheduledDate}`);
  });
  
  const choice = await ask('\nEnter the number of the interview to cancel (or 0 to go back): ');
  const index = parseInt(choice) - 1;
  
  if (index >= 0 && index < interviews.length) {
    const interview = interviews[index];
    const confirm = await ask(`Are you sure you want to cancel the interview for ${interview.candidate}? (y/N): `);
    
    if (confirm.toLowerCase() === 'y') {
      cancelScheduledInterview(interview.interviewId);
      console.log('Interview cancelled successfully!');
    } else {
      console.log('Cancellation cancelled.');
    }
  } else if (choice !== '0') {
    console.log('Invalid choice.');
  }
}

async function mainMenu() {
  while (true) {
    console.log('\n==============================');
    console.log('INTERVIEW MANAGEMENT SYSTEM');
    console.log('==============================');
    console.log('1. View all scheduled interviews');
    console.log('2. Cancel an interview');
    console.log('3. Exit');
    
    const choice = await ask('Select an option (1-3): ');
    
    if (choice === '1') {
      await viewInterviews();
    } else if (choice === '2') {
      await cancelInterview();
    } else if (choice === '3') {
      break;
    } else {
      console.log('Invalid option. Please try again.');
    }
  }
  
  rl.close();
}

// Run the CLI
if (require.main === module) {
  mainMenu().catch(console.error);
} 