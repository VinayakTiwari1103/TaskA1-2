import express from 'express';
import path from 'path';
import fs from 'fs';
import { Connection, WorkflowClient } from '@temporalio/client';
import { interviewerSlotsSignal } from './workflows/interview-scheduling-workflow';

const app = express();
const PORT = process.env.SLOT_FORM_PORT || 8087; // Using port 8080
const SUBMISSIONS_FILE = path.join(__dirname, 'slot-submissions.json');

app.use(express.urlencoded({ extended: true }));

// Serve the slot selection form
app.get('/slot-form', (req, res) => {
  const { token, interviewer, date } = req.query;
  if (!token || !interviewer) {
    return res.send('<h2>Invalid or missing token/interviewer.</h2>');
  }
  
  // Get the proposed date from the URL parameter with proper formatting
  let displayDate = 'the proposed date';
  if (date && date !== 'undefined' && date !== 'null') {
    displayDate = date as string;
  }
  
  res.send(`
    <html>
      <head>
        <title>Submit Available Slots</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f7f7f7; }
          .container { max-width: 500px; margin: 40px auto; background: #fff; padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px #0001; }
          h2 { color: #1976d2; }
          .date-info { background: #e3f2fd; padding: 12px; border-radius: 4px; margin-bottom: 20px; }
          label { display: block; margin-top: 16px; font-weight: bold; }
          input[type="time"] { margin-right: 8px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
          .time-slot { background: #f5f5f5; padding: 12px; border-radius: 4px; margin-bottom: 8px; }
          button { margin-top: 24px; background: #1976d2; color: #fff; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-size: 16px; }
          button:hover { background: #1565c0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Submit Your Available Time Slots</h2>
          <div class="date-info">
            <strong>Interview Date: ${displayDate}</strong><br>
            Please provide your available time slots for this date.
          </div>
          <form method="POST" action="/submit-slot">
            <input type="hidden" name="token" value="${token}" />
            <input type="hidden" name="interviewer" value="${interviewer}" />
            <input type="hidden" name="proposed_date" value="${displayDate}" />
            
            <div class="time-slot">
              <label>Time Slot 1 (Required):</label>
              <input type="time" name="slot_start_1" required> to <input type="time" name="slot_end_1" required>
            </div>
            
            <div class="time-slot">
              <label>Time Slot 2 (Optional):</label>
              <input type="time" name="slot_start_2"> to <input type="time" name="slot_end_2">
            </div>
            
            <div class="time-slot">
              <label>Time Slot 3 (Optional):</label>
              <input type="time" name="slot_start_3"> to <input type="time" name="slot_end_3">
            </div>
            
            <button type="submit">Submit Available Slots</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.post('/submit-slot', async (req, res) => {
  const { token, interviewer, proposed_date } = req.body;
  if (!token || !interviewer) {
    return res.send('<h2>Invalid submission.</h2>');
  }
  
  const slots = [];
  for (let i = 1; i <= 3; i++) {
    const start = req.body[`slot_start_${i}`];
    const end = req.body[`slot_end_${i}`];
    if (start && end) {
      slots.push({ 
        date: proposed_date || new Date().toISOString().split('T')[0], // date cli wale direct
        startTime: start, 
        endTime: end 
      });
    }
  }
  
  if (slots.length === 0) {
    return res.send('<h2>Error: Please provide at least one time slot.</h2>');
  }
  
  // Save submission- check DN
  let data = [];
  if (fs.existsSync(SUBMISSIONS_FILE)) {
    try {
      const fileContent = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
      if (fileContent.trim()) {
        data = JSON.parse(fileContent);
      }
    } catch (error) {
      console.error('Error reading submissions file:', error);
      data = [];
    }
  }
  data.push({ token, interviewer, slots, submittedAt: new Date().toISOString() });
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(data, null, 2));

  // Signal the temp - workflow
  try {
    const connection = await Connection.connect();
    const client = new WorkflowClient({ connection });
    const handle = client.getHandle(token);
    await handle.signal(interviewerSlotsSignal, slots);
    res.send(`
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:40px auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 2px 8px #0001;">
        <h2 style="color:#4caf50;">Success!</h2>
        <p>Thank you <strong>${interviewer}</strong>! Your available time slots have been submitted:</p>
        <ul>
          ${slots.map(slot => `<li>${slot.date} from ${slot.startTime} to ${slot.endTime}</li>`).join('')}
        </ul>
        <p>The candidate will be notified of these available slots shortly.</p>
      </div>
    `);
  } catch (err) {
    console.error('Failed to notify workflow:', err); // we can use any - check dn
    res.send(`
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:40px auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 2px 8px #0001;">
        <h2 style="color:#ff9800;">Partially Success</h2>
        <p>Your slots have been saved, but we couldn't automatically notify the system. Please contact the recruiter.</p>
        <p><strong>Your submitted slots:</strong></p>
        <ul>
          ${slots.map(slot => `<li>${slot.date} from ${slot.startTime} to ${slot.endTime}</li>`).join('')}
        </ul>
      </div>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Slot form server running at http://localhost:${PORT}/slot-form?token=INTERVIEW_ID&interviewer=INTERVIEWER_NAME`);
}); 