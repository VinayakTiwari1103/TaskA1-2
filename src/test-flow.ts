import 'dotenv/config';
import { Connection, WorkflowClient } from '@temporalio/client';
import { interviewSchedulingWorkflow, recruiterBookSlotSignal, interviewerSlotsSignal, candidateRequestSlotSignal } from './workflows/interview-scheduling-workflow';
import { sendInterviewerRequestEmail, sendCandidateSlotsEmail, sendInterviewConfirmationEmail } from './email-service';
import { v4 as uuidv4 } from 'uuid';

async function testCompleteFlow() {
  console.log('=== Testing Complete Interview Scheduling Flow ===\n');
  
  // 1
  const connection = await Connection.connect();
  const client = new WorkflowClient({ connection });
  const workflowId = `interview-${uuidv4()}`;
  
  const interviewData = {
    interviewId: workflowId,
    candidate: 'Rahul Kumar',
    candidateEmail: '22051214@kiit.ac.in',
    interviewer: 'Vinayak Tiwari',
    interviewerEmail: 'vinayaktiwari204@gmail.com',
    recruiter: 'System',
    recruiterEmail: process.env.GMAIL_USER || 'system@interview-scheduler.com',
    status: 'WAITING_FOR_INTERVIEWER_SLOTS' as const,
    round: 1
  };
  
  console.log('1. Starting interview workflow...');
  await client.start(interviewSchedulingWorkflow, {
    args: [interviewData],
    taskQueue: 'interview-scheduler',
    workflowId,
  });
  console.log(`   ✅ Workflow started with ID: ${workflowId}\n`);
  
  // 2
  console.log('2. Booking interview date...');
  const handle = client.getHandle(workflowId);
  await handle.signal(recruiterBookSlotSignal, '2024-07-25');
  console.log('   ✅ Date booked: 2024-07-25\n');
  
  // 3. Send email to interviewer
  console.log('3. Sending email to interviewer...');
  await sendInterviewerRequestEmail(
    interviewData.interviewerEmail,
    interviewData.interviewer,
    interviewData.candidate,
    '2024-07-25',
    workflowId
  );
  console.log('   ✅ Email sent to interviewer\n');
  
  // 4. Simulate interviewer response (in real scenario, this would come from email)
  console.log('4. Simulating interviewer response...');
  const interviewerSlots = [
    { date: '2024-07-25', startTime: '10:00', endTime: '11:00' },
    { date: '2024-07-25', startTime: '14:00', endTime: '15:00' },
    { date: '2024-07-25', startTime: '16:00', endTime: '17:00' }
  ];
  await handle.signal(interviewerSlotsSignal, interviewerSlots);
  console.log('   ✅ Interviewer slots received\n');
  
  // 5. Send email to candidate
  console.log('5. Sending email to candidate...');
  await sendCandidateSlotsEmail(
    interviewData.candidateEmail,
    interviewData.candidate,
    interviewData.interviewer,
    interviewerSlots,
    workflowId
  );
  console.log('   ✅ Email sent to candidate\n');
  
  // 6. Simulate candidate response (in real scenario, this would come from email)
  console.log('6. Simulating candidate response...');
  const selectedSlot = { date: '2024-07-25', startTime: '14:00', endTime: '15:00' };
  await handle.signal(candidateRequestSlotSignal, selectedSlot);
  console.log('   ✅ Candidate accepted slot\n');
  
  // 7. Send confirmation email with Meet link
  console.log('7. Sending confirmation email...');
  await sendInterviewConfirmationEmail(
    interviewData.candidateEmail,
    interviewData.candidate,
    interviewData.interviewerEmail,
    interviewData.interviewer,
    selectedSlot,
    workflowId,
    'https://meet.google.com/abc-defg-hij'
  );
  console.log('   ✅ Confirmation email sent with Meet link\n');
  
  console.log('=== Flow completed successfully! ===');
  console.log(`Interview scheduled for: ${selectedSlot.date} ${selectedSlot.startTime}-${selectedSlot.endTime}`);
}

// Run the test
if (require.main === module) {
  testCompleteFlow().catch(console.error);
} 