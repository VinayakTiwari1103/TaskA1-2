// import fetch from 'node-fetch';
// import axios from 'axios';
// import dotenv from 'dotenv';
// dotenv.config();

// Hugging Face code commented out
// const HF_API_KEY = process.env.HF_API_KEY;
// console.log('DEBUG: HF_API_KEY loaded?', !!HF_API_KEY);

// Helper to parse JSON response safely
// function safeParseTimeSlot(json: string): any | null {
//   try {
//     const obj = JSON.parse(json);
//     if (obj.date && obj.start_time && obj.end_time) {
//       return {
//         date: obj.date,
//         start_time: obj.start_time,
//         end_time: obj.end_time
//       };
//     }
//     return null;
//   } catch {
//     return null;
//   }
// }

function addContextIfAmbiguous(input: string): string {
  const dayPattern = /^\s*(\d{1,2})(st|nd|rd|th)?\s*$/i;
  if (dayPattern.test(input.trim())) {
    const today = new Date();
    const month = today.toLocaleString('default', { month: 'long' });
    const year = today.getFullYear();
    return `Please reschedule the meeting to ${input.trim()} of ${month} ${year}.`;
  }
  return input;
}

function addVeryWellFormedContext(input: string, context: any): string {
  function getISTDateTime() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const istTime = new Date(utc + 5.5 * 60 * 60 * 1000);
    return istTime;
  }

  const istNow = getISTDateTime();
  const currentDate = istNow.toISOString().slice(0, 10);
  const currentTime = istNow.toTimeString().slice(0, 5);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDay = days[istNow.getDay()];

  // Scheduled interview details (editable)
  const scheduledDate = context?.scheduledDate || '2025-07-18';
  const scheduledStartTime = context?.scheduledStartTime || '14:00';
  const scheduledEndTime = context?.scheduledEndTime || '15:00';
  const scheduledTime = `${scheduledStartTime} - ${scheduledEndTime}`;
  const candidate = context?.candidate || 'Vinayak Tiwari';
  const interviewer = context?.interviewer || 'Robert Tiwari';
  const position = context?.position || 'Software Engineer';

  return `You are an AI assistant for interview scheduling.
Current date: ${currentDate} (IST)
Current day: ${currentDay}
Current time: ${currentTime} (IST)
All times are in Indian Standard Time (IST, UTC+5:30).

The current interview is scheduled as follows:
  Candidate: ${candidate}
  Interviewer: ${interviewer}
  Position: ${position}
  Date: ${scheduledDate} (IST)
  Time: ${scheduledStartTime} - ${scheduledEndTime} (IST)

A rescheduling request has been made: "${input}"

Extract the new date and time for the interview from the request above. Respond ONLY in JSON in the following format: { "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM" } (all in IST).`;
}

// Helper to extract ISO date(s) and time(s) from input
// function extractDateTimeFromInput(input: string): any | null {
//   const isoDatePattern = /\b(\d{4}-\d{2}-\d{2})\b/g;
//   const matches = [...input.matchAll(isoDatePattern)];
//   let date: string | undefined;
//   if (matches.length >= 1) {
//     date = matches[0][1];
//   }

//   // More robust: allow optional words before the time range
//   const timeRangePattern = /(?:\b\w+\b\s*){0,3}?(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\s*(?:-|to|–)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?(?:\s*in\s*\w+)?/i;
//   const timeRangeMatch = input.match(timeRangePattern);

//   let start_time = '09:00';
//   let end_time = '10:00';

//   if (timeRangeMatch) {
//     console.log('DEBUG: Matched time range:', timeRangeMatch);
//     // Parse start time
//     let startHour = parseInt(timeRangeMatch[1], 10);
//     let startMinute = timeRangeMatch[2] ? parseInt(timeRangeMatch[2], 10) : 0;
//     let startAMPM = timeRangeMatch[3]?.toLowerCase();
//     // Parse end time
//     let endHour = parseInt(timeRangeMatch[4], 10);
//     let endMinute = timeRangeMatch[5] ? parseInt(timeRangeMatch[5], 10) : 0;
//     let endAMPM = timeRangeMatch[6]?.toLowerCase();

//     // Handle AM/PM for start
//     if (startAMPM === 'pm' && startHour < 12) startHour += 12;
//     if (startAMPM === 'am' && startHour === 12) startHour = 0;
//     // Handle AM/PM for end
//     if (endAMPM === 'pm' && endHour < 12) endHour += 12;
//     if (endAMPM === 'am' && endHour === 12) endHour = 0;

//     start_time = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
//     end_time = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
//   } else {
//     // Match single time in HH:MM or H[H]AM/PM format
//     const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/;
//     const timeMatch = input.match(timePattern);
//     if (timeMatch) {
//       console.log('DEBUG: Matched single time:', timeMatch);
//       let hour = parseInt(timeMatch[1], 10);
//       let minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
//       const ampm = timeMatch[3]?.toLowerCase();
//       if (ampm === 'pm' && hour < 12) hour += 12;
//       if (ampm === 'am' && hour === 12) hour = 0;
//       start_time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
//       const endHour = (hour + 1) % 24;
//       end_time = `${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
//     }
//     // Only use time blocks if no explicit range is found
//     if (!timeRangeMatch) {
//       if (/morning/i.test(input)) {
//         console.log('DEBUG: Using time block morning');
//         start_time = '09:00';
//         end_time = '12:00';
//       } else if (/afternoon/i.test(input)) {
//         console.log('DEBUG: Using time block afternoon');
//         start_time = '13:00';
//         end_time = '17:00';
//       } else if (/evening/i.test(input)) {
//         console.log('DEBUG: Using time block evening');
//         start_time = '17:00';
//         end_time = '20:00';
//       } else if (/night/i.test(input)) {
//         console.log('DEBUG: Using time block night');
//         start_time = '20:00';
//         end_time = '22:00';
//       }
//     }
//   }

//   if (date) {
//     console.log('DEBUG: Returning parsed date/time:', { date, start_time, end_time });
//     return { date, start_time, end_time };
//   }
//   return null;
// }

function advancedHeuristicTimeSlot(input: string, context: any): any | null {
  if (!context || !context.scheduledDate) return null;
  const scheduledDate = context.scheduledDate;
  const start_time = context.scheduledStartTime || '09:00';
  const end_time = context.scheduledEndTime || '10:00';
  const dateObj = new Date(scheduledDate);
  const lower = input.toLowerCase();

  if (/\b(before|previous|earlier|one day before|day before|reschedule before)\b/.test(lower)) {
    const newDate = new Date(dateObj);
    newDate.setDate(dateObj.getDate() - 1);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;
    return { date, start_time, end_time };
  }
  if (/\b(after|next|later|one day after|day after|reschedule after)\b/.test(lower)) {
    const newDate = new Date(dateObj);
    newDate.setDate(dateObj.getDate() + 1);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;
    return { date, start_time, end_time };
  }
  const nthMatch = lower.match(/\b(\d{1,2})(st|nd|rd|th)\b/);
  if (nthMatch) {
    const nth = parseInt(nthMatch[1], 10);
    const year = dateObj.getFullYear();
    let month = dateObj.getMonth();
    let candidateDate = new Date(year, month, nth);
    if (candidateDate < dateObj) {
      month += 1;
      if (month > 11) {
        month = 0;
        candidateDate = new Date(year + 1, month, nth);
      } else {
        candidateDate = new Date(year, month, nth);
      }
    }
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${candidateDate.getFullYear()}-${pad(candidateDate.getMonth() + 1)}-${pad(candidateDate.getDate())}`;
    return { date, start_time, end_time };
  }
  // Handle 'tomorrow'
  if (/\btomorrow\b/.test(lower)) {
    const newDate = new Date(dateObj);
    newDate.setDate(dateObj.getDate() + 1);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;
    return { date, start_time, end_time };
  }
  // Handle 'today'
  if (/\btoday\b/.test(lower)) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
    return { date, start_time, end_time };
  }
  // Handle 'day after tomorrow'
  if (/\bday after tomorrow\b/.test(lower)) {
    const newDate = new Date(dateObj);
    newDate.setDate(dateObj.getDate() + 2);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;
    return { date, start_time, end_time };
  }
  // Handle 'week after', 'next week'
  if (/\b(next week|week after)\b/.test(lower)) {
    const newDate = new Date(dateObj);
    newDate.setDate(dateObj.getDate() + 7);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;
    return { date, start_time, end_time };
  }
  // Handle 'week before', 'previous week'
  if (/\b(previous week|week before)\b/.test(lower)) {
    const newDate = new Date(dateObj);
    newDate.setDate(dateObj.getDate() - 7);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;
    return { date, start_time, end_time };
  }
  if (/\b(reschedule|change|move|shift)\b/.test(lower)) {
    return null;
  }
  return null;
}

// async function parseTimeSlotWithHuggingFace(input: string, veryWellFormedContext = false, context: any = {}): Promise<any | null> {
//   if (!HF_API_KEY) return null;
//   try {
//     let contextInput = addContextIfAmbiguous(input);
//     if (veryWellFormedContext) {
//       contextInput = addVeryWellFormedContext(input, context);
//     }
//     const response = await axios.post(
//       'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
//       { inputs: contextInput },
//       { headers: { Authorization: `Bearer ${HF_API_KEY}` } }
//     );
//     console.log('DEBUG: Hugging Face response:', response.data);
//     if (typeof response.data === 'string') {
//       try {
//         return safeParseTimeSlot(response.data);
//       } catch {}
//     }
//     if (response.data && typeof response.data[0]?.generated_text === 'string') {
//       return safeParseTimeSlot(response.data[0].generated_text);
//     }
//     const entities = response.data[0]?.entities || response.data;
//     const dateEntity = entities.find((e: any) => e.entity_group === 'DATE');
//     if (dateEntity) {
//       const dateStr = dateEntity.word;
//       const parsedDate = Date.parse(dateStr);
//       if (!isNaN(parsedDate)) {
//         const date = new Date(parsedDate);
//         const pad = (n: number) => n.toString().padStart(2, '0');
//         const formattedDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
//         const start_time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
//         const end = new Date(date.getTime() + 60 * 60 * 1000);
//         const end_time = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
//         return {
//           date: formattedDate,
//           start_time,
//           end_time
//         };
//       }
//     }
//     return null;
//   } catch (err) {
//     console.error('Hugging Face API error:', err);
//     return null;
//   }
// }

// Enhanced NLP parser using Ollama for intelligent date/time extraction
const axios = require('axios');

// Helper to parse JSON response safely
function safeParseTimeSlot(json: string): any | null {
  try {
    const obj = JSON.parse(json);
    if (obj.date && obj.start_time && obj.end_time) {
      return {
        date: obj.date,
        start_time: obj.start_time,
        end_time: obj.end_time
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Enhanced parseTimeSlot function using Ollama for intelligent NLP
export async function parseTimeSlot(input: string, context?: any): Promise<any> {
  console.log('Enhanced NLP parsing input:', input);
  
  // 1st try AI
  try {
    const ollamaResult = await parseWithOllama(input, context);
    if (ollamaResult) {
      console.log('Ollama parsed result:', ollamaResult);
      return ollamaResult;
    }
  } catch (error) {
    console.log('Ollama not available, falling back to heuristic parsing');
  }
  
  // fail ollama then this
  const heuristicResult = parseWithAdvancedHeuristics(input, context);
  if (heuristicResult) {
    console.log('Heuristic parsed result:', heuristicResult);
    return heuristicResult;
  }
  
  return parseWithBasicPatterns(input);
}

function cleanEmailInput(input: string): string {
  const lines = input.split('\n');
  const cleanLines = [];
  let foundEmailThread = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (
      trimmedLine.startsWith('On ') && trimmedLine.includes('wrote:') ||
      trimmedLine.startsWith('From:') ||
      trimmedLine.startsWith('To:') ||
      trimmedLine.startsWith('Subject:') ||
      trimmedLine.startsWith('Date:') ||
      trimmedLine.startsWith('>') ||
      trimmedLine.includes('Dear ') && trimmedLine.includes('provided the following') ||
      trimmedLine.includes('Interview Scheduler System')
    ) {
      foundEmailThread = true;
      break;
    }
    
    if (foundEmailThread && (
      trimmedLine.includes('Please reply with ACCEPT or REJECT') ||
      trimmedLine.includes('- ACCEPT to confirm') ||
      trimmedLine.includes('- REJECT to decline')
    )) {
      continue;
    }
    
    if (
      trimmedLine === '' ||
      trimmedLine === 'Have a nice day!' ||
      trimmedLine === 'Best regards,' ||
      trimmedLine === 'Thanks,'
    ) {
      continue;
    }
    
    cleanLines.push(trimmedLine);
  }
  
  return cleanLines.join(' ').trim();
}

async function parseWithOllama(input: string, context?: any): Promise<any | null> {
  const currentDate = new Date().toISOString().split('T')[0];
  const currentTime = new Date().toTimeString().slice(0, 5);
  
  const cleanedInput = cleanEmailInput(input);
  
  const prompt = `You are an intelligent interview scheduling assistant. Parse the following message and extract the date and time information.

Current Date: ${currentDate}
Current Time: ${currentTime}

${context ? `
Current Interview Context:
- Candidate: ${context.candidate || 'Unknown'}
- Interviewer: ${context.interviewer || 'Unknown'}  
- Originally proposed date: ${context.scheduledDate || 'Unknown'}
- Originally proposed time: ${context.scheduledStartTime || 'Unknown'} - ${context.scheduledEndTime || 'Unknown'}
` : ''}

Message to parse: "${cleanedInput}"

Instructions:
1. Extract the date in YYYY-MM-DD format
2. Extract start time in HH:MM format (24-hour)
3. Extract end time in HH:MM format (24-hour)
4. If end time is not specified, assume 1-hour duration
5. CRITICAL DATE FORMAT HANDLING:
   - Input format is ALWAYS DD-MM-YYYY (day first, then month, then year)
   - "3-08-2025" = 3rd August 2025 = "2025-08-03"
   - "12-11-2025" = 12th November 2025 = "2025-11-12" (NOT December 11th!)
   - "31-12-2025" = 31st December 2025 = "2025-12-31"
   - "1-01-2025" = 1st January 2025 = "2025-01-01"
6. Handle times like "13:00-14:00PM", "1:00-2:00PM", "1 PM to 2 PM", "morning", "afternoon", etc.
7. Convert AM/PM to 24-hour format: 1:00PM = 13:00, 2:00PM = 14:00
8. If you see "PM" after a time range in 24-hour format (like "13:00-14:00PM"), ignore the PM since it's already 24-hour
9. For "1:00-2:00PM" convert to "13:00-14:00"
10. For single times like "3:00 PM", convert to "15:00" and add 1 hour duration = "15:00-16:00"

IMPORTANT: Only return valid dates between 2025-01-01 and 2026-12-31. If no date is found, use tomorrow (${new Date(Date.now() + 86400000).toISOString().split('T')[0]}).

Respond ONLY with valid JSON in this exact format:
{"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Ollama attempt ${attempt}/3`);
      
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3.2:1b',
        prompt: prompt,
        stream: false,
        options: {
          temperature: attempt === 1 ? 0.1 : 0.05, // Lower temperature for more consistency- https://medium.com/@rajesh.sgr/temperature-in-llm-settings-e1986a509a45
          top_p: 0.9,
          num_predict: 100, 
          stop: ['}', '\n\n'] // Stop after JSON-need check 
        }
      }, {
        timeout: 8000 
      });

      if (response.data && response.data.response) {
        console.log(`Ollama attempt ${attempt} raw response:`, response.data.response);
        
        const jsonMatch = response.data.response.match(/\{[^}]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            
            if (parsed.date && parsed.start_time && parsed.end_time) {
              // Validate date 
              if (/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
                // Validate time 
                if (/^\d{2}:\d{2}$/.test(parsed.start_time) && /^\d{2}:\d{2}$/.test(parsed.end_time)) {
                  console.log(`Ollama attempt ${attempt} successful:`, parsed);
                  return parsed;
                }
              }
            }
          } catch (parseError: any) {
            console.log(`JSON parse error on attempt ${attempt}:`, parseError.message);
          }
        }
      }
    } catch (error: any) {
      console.log(`Ollama attempt ${attempt} failed:`, error.message);
      if (attempt === 3) {
        throw error; // Only give failed atmpt
      }
    }
  }
  
  console.log('All Ollama attempts failed');
  return null;
}

function parseWithAdvancedHeuristics(input: string, context?: any): any | null {
  const lower = input.toLowerCase();
  const today = new Date();
  
  console.log('Advanced heuristics parsing input:', input.substring(0, 100));
  
  const cleanedInput = cleanEmailInput(input);
  console.log('Cleaned input:', cleanedInput);
  
  const cleanLower = cleanedInput.toLowerCase();
  
  let parsedDate = null;
  let parsedStartTime = null;
  let parsedEndTime = null;
  
  const datePatterns = [
    { regex: /(\d{1,2})-(\d{1,2})-(\d{4})/, format: 'DMY' },
    { regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, format: 'DMY' },
    { regex: /(\d{4})-(\d{1,2})-(\d{1,2})/, format: 'YMD' },
    { regex: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i, format: 'MDY' },
  ];
  
  for (const pattern of datePatterns) {
    const match = cleanedInput.match(pattern.regex);
    if (match) {
      console.log('Date match found:', match);
      if (pattern.format === 'DMY') {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        
        if (day > 31 || day < 1 || month > 12 || month < 1 || year < 2025) {
          console.log('Invalid date detected, skipping:', { day, month, year });
          continue;
        }
        
        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // check needed
        if (day > daysInMonth[month - 1]) {
          console.log('Invalid day for month, skipping:', { day, month, year });
          continue;
        }
        
        const dayStr = day.toString().padStart(2, '0');
        const monthStr = month.toString().padStart(2, '0');
        parsedDate = `${year}-${monthStr}-${dayStr}`;
        console.log('Parsed DMY date:', parsedDate);
      } else if (pattern.format === 'YMD') {
        const year = match[1];
        const month = match[2].padStart(2, '0');
        const day = match[3].padStart(2, '0');
        parsedDate = `${year}-${month}-${day}`;
        console.log('Parsed YMD date:', parsedDate);
      } else if (pattern.format === 'MDY') {
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                           'july', 'august', 'september', 'october', 'november', 'december'];
        const monthIndex = monthNames.indexOf(match[1].toLowerCase()) + 1;
        const day = match[2].padStart(2, '0');
        const year = match[3];
        parsedDate = `${year}-${monthIndex.toString().padStart(2, '0')}-${day}`;
        console.log('Parsed MDY date:', parsedDate);
      }
      break;
    }
  }
  // AI PROVIDED TIME PATTERN
  const timePatterns = [
    // HH:MM-HH:MM with optional PM (like "13:00-14:00PM")
    /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(pm|PM)?/,
    // HH:MM AM/PM - HH:MM AM/PM
    /(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)\s*(?:to|-)\s*(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)/,
    // H AM/PM - H AM/PM (like "1:00-2:00PM")
    /(\d{1,2})\s*:\s*(\d{2})\s*-\s*(\d{1,2})\s*:\s*(\d{2})\s*(pm|PM|am|AM)/,
    // H AM/PM - H AM/PM
    /(\d{1,2})\s*(am|pm|AM|PM)\s*(?:to|-)\s*(\d{1,2})\s*(am|pm|AM|PM)/,
    // Single time with AM/PM (like "3:00 PM")
    /(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)/,
    // Single time without AM/PM
    /(\d{1,2}):(\d{2})/
  ];
  
  for (const pattern of timePatterns) {
    const match = cleanedInput.match(pattern);
    if (match) {
      console.log('Time match found:', match);
      
      if (pattern.source.includes('-')) {
        let startHour = parseInt(match[1], 10);
        let startMin = parseInt(match[2] || '0', 10);
        let endHour = parseInt(match[3] || (startHour + 1).toString(), 10);
        let endMin = parseInt(match[4] || match[2] || '0', 10);
        
        const pmSuffix = match[5] || match[6] || '';
        
        if (pmSuffix.toLowerCase() === 'pm' || pmSuffix.toLowerCase() === 'am') {
          if (pmSuffix.toLowerCase() === 'pm') {
            if (startHour < 12) startHour += 12;
            if (endHour < 12) endHour += 12;
          } else if (pmSuffix.toLowerCase() === 'am') {
            if (startHour === 12) startHour = 0;
            if (endHour === 12) endHour = 0;
          }
        }
        
        parsedStartTime = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
        parsedEndTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
      } else {
        let hour = parseInt(match[1], 10);
        let min = parseInt(match[2] || '0', 10);
        const amPm = (match[3] || '').toLowerCase();
        
        if (amPm === 'pm' && hour !== 12) hour += 12;
        if (amPm === 'am' && hour === 12) hour = 0;
        
        parsedStartTime = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        parsedEndTime = `${((hour + 1) % 24).toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      }
      
      console.log('Parsed times:', { start: parsedStartTime, end: parsedEndTime });
      break;
    }
  }
  
  if (!parsedDate) {
    if (/\btomorrow\b/.test(cleanLower)) {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      parsedDate = tomorrow.toISOString().split('T')[0];
      console.log('Using relative date (tomorrow):', parsedDate);
    } else if (/\btoday\b/.test(cleanLower)) {
      parsedDate = today.toISOString().split('T')[0];
      console.log('Using relative date (today):', parsedDate);
    } else if (/\bnext\s+week\b/.test(cleanLower)) {
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      parsedDate = nextWeek.toISOString().split('T')[0];
      console.log('Using relative date (next week):', parsedDate);
    } else if (/\bday\s+after\s+tomorrow\b/.test(cleanLower)) {
      const dayAfter = new Date(today);
      dayAfter.setDate(today.getDate() + 2);
      parsedDate = dayAfter.toISOString().split('T')[0];
      console.log('Using relative date (day after tomorrow):', parsedDate);
    }
  }
  
  if (!parsedStartTime) {
    if (/\bmorning\b/.test(cleanLower)) {
      parsedStartTime = '09:00';
      parsedEndTime = '10:00';
      console.log('Using time block (morning)');
    } else if (/\bafternoon\b/.test(cleanLower)) {
      parsedStartTime = '14:00';
      parsedEndTime = '15:00';
      console.log('Using time block (afternoon)');
    } else if (/\bevening\b/.test(cleanLower)) {
      parsedStartTime = '18:00';
      parsedEndTime = '19:00';
      console.log('Using time block (evening)');
    } else if (/\bnight\b/.test(cleanLower)) {
      parsedStartTime = '20:00';
      parsedEndTime = '21:00';
      console.log('Using time block (night)');
    }
  }
  
  if (context && !parsedDate && context.scheduledDate) {
    if (/\b(before|previous|earlier)\b/.test(cleanLower)) {
      const prevDay = new Date(context.scheduledDate);
      prevDay.setDate(prevDay.getDate() - 1);
      parsedDate = prevDay.toISOString().split('T')[0];
      console.log('📅 Using context-based relative date (before):', parsedDate);
    } else if (/\b(after|next|later)\b/.test(cleanLower)) {
      const nextDay = new Date(context.scheduledDate);
      nextDay.setDate(nextDay.getDate() + 1);
      parsedDate = nextDay.toISOString().split('T')[0];
      console.log('📅 Using context-based relative date (after):', parsedDate);
    }
  }
  
  if (!parsedDate) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const pad = (n: number) => n.toString().padStart(2, '0');
    parsedDate = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
    console.log('📅 Using fallback date (tomorrow):', parsedDate);
  }
  
  if (!parsedStartTime) {
    parsedStartTime = context?.scheduledStartTime || '10:00';
    parsedEndTime = context?.scheduledEndTime || '11:00';
    console.log('⏰ Using fallback times:', { start: parsedStartTime, end: parsedEndTime });
  }
  
  const result = {
    date: parsedDate,
    start_time: parsedStartTime,
    end_time: parsedEndTime
  };
  
  console.log('Final heuristic result:', result);
  return result;
}

function parseWithBasicPatterns(input: string): any {
  console.log('Using basic pattern parsing');
  
  const datePatterns = [
    /(\d{1,2})-(\d{1,2})-(\d{4})/,  // DD-MM-YYYY
    /(\d{4})-(\d{1,2})-(\d{1,2})/,  // YYYY-MM-DD
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // DD/MM/YYYY
  ];
  
  let date = null;
  for (const pattern of datePatterns) {
    const match = input.match(pattern);
    if (match) {
      if (pattern === datePatterns[0]) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        date = `${year}-${month}-${day}`;
      } else if (pattern === datePatterns[1]) {
        const year = match[1];
        const month = match[2].padStart(2, '0');
        const day = match[3].padStart(2, '0');
        date = `${year}-${month}-${day}`;
      }
      break;
    }
  }
  
  const start_time = "14:00";
  const end_time = "15:00";
  
  if (date) {
    return { date, start_time, end_time };
  }
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  const defaultDate = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  
  return { date: defaultDate, start_time, end_time };
} 

export function parseConfirmationResponse(input: string): { type: 'ACCEPT' | 'REJECT' | 'UNKNOWN', confidence: number } {
  console.log('🔍 Raw confirmation input:', input.substring(0, 200));
  
  const cleanedInput = cleanEmailInput(input);
  console.log('🧹 Cleaned confirmation input:', cleanedInput.substring(0, 100));
  
  const lines = cleanedInput.split('\n').filter(line => line.trim());
  const firstMeaningfulLine = lines.find(line => 
    !line.match(/^(on|from|to|date|subject|wrote:|sent:|>)/i) && 
    line.trim().length > 0
  );
  
  console.log('📝 First meaningful line:', firstMeaningfulLine);
  
  const primaryInput = (firstMeaningfulLine || cleanedInput).toLowerCase().trim();
  console.log('🎯 Primary input for analysis:', primaryInput);
  
  if (/\b(reschedule|need to reschedule|please reschedule|can we reschedule)\b/i.test(primaryInput)) {
    console.log('🔄 RESCHEDULE REQUEST detected - treating as UNKNOWN');
    return { type: 'UNKNOWN', confidence: 0.3 };
  }
  
  const emailThreadPattern = /On\s+.*wrote:|>.*REJECT|>.*ACCEPT|Please reply with/i;
  const isInEmailThread = emailThreadPattern.test(cleanedInput);
  
  const negativePatterns = [
    /\b(cannot|can't|can not)\s+(accept|confirm|agree)\b/i,
    /\b(don't|do not|won't|will not)\s+(accept|confirm|agree)\b/i,
    /\b(unable to|not able to)\s+(accept|confirm|agree)\b/i,
    /\b(reject|decline|cancel)\b/i,
    /\bnot\s+(available|possible|working)\b/i,
    /\b(sorry|unfortunately)\b.*\b(cannot|can't|not|no)\b/i,
    /\b(won't|will not)\s+(work|be available)\b/i,
    /\b(doesn't|does not)\s+(work|suit)\b/i,
    /\b(can't|cannot)\s+(make it|attend|be there)\b/i,
    /\bnot\s+(free|available)\b/i,
    /\b(busy|occupied|unavailable)\b/i
  ];
  
  for (const pattern of negativePatterns) {
    if (pattern.test(primaryInput) && !isInEmailThread) {
      console.log('NEGATIVE CONTEXT detected - treating as REJECT:', pattern.source);
      return { type: 'REJECT', confidence: 0.9 };
    }
  }
  
  if (primaryInput === 'accept' || primaryInput === 'accepted') {
    console.log('EXACT ACCEPT match');
    return { type: 'ACCEPT', confidence: 1.0 };
  }
  
  if (primaryInput === 'yes') {
    console.log('EXACT YES match');
    return { type: 'ACCEPT', confidence: 1.0 };
  }
  
  if (primaryInput === 'reject' || primaryInput === 'rejected') {
    console.log('EXACT REJECT match');
    return { type: 'REJECT', confidence: 1.0 };
  }
  
  if (primaryInput === 'no') {
    console.log('EXACT NO match');
    return { type: 'REJECT', confidence: 1.0 };
  }
  
  const strongAcceptPatterns = [
    /^accept\b/i,
    /^yes\b/i,
    /^ok\b/i,
    /^okay\b/i,
    /^confirm\b/i,
    /^confirmed\b/i,
    /^agree\b/i,
    /^agreed\b/i,
    /^approve\b/i,
    /^approved\b/i,
    /^sounds good\b/i,
    /^looks good\b/i,
    /^perfect\b/i
  ];
  
  for (const pattern of strongAcceptPatterns) {
    if (pattern.test(primaryInput)) {
      console.log('STRONG ACCEPT pattern matched:', pattern.source);
      return { type: 'ACCEPT', confidence: 0.95 };
    }
  }
  
  const strongRejectPatterns = [
    /^reject\b/i,
    /^rejected\b/i,
    /^no\b/i,
    /^decline\b/i,
    /^declined\b/i,
    /^cancel\b/i,
    /^cancelled\b/i,
    /^deny\b/i,
    /^denied\b/i,
    /^not available\b/i,
    /^can't\b/i,
    /^cannot\b/i,
    /^won't work\b/i,
    /^doesn't work\b/i,
    /^sorry\b/i,
    /^unfortunately\b/i
  ];
  
  for (const pattern of strongRejectPatterns) {
    if (pattern.test(primaryInput)) {
      console.log('STRONG REJECT pattern matched:', pattern.source);
      return { type: 'REJECT', confidence: 0.95 };
    }
  }
  
  if (/\b(accept|yes|ok|okay|confirm|agree|approve|perfect|good|great|fine|works|sounds good|looks good)\b/i.test(cleanedInput)) {
    console.log('FALLBACK ACCEPT detected');
    return { type: 'ACCEPT', confidence: 0.8 };
  }
  
  if (/\b(reject|no|decline|cancel|deny)\b/i.test(cleanedInput)) {
    console.log('FALLBACK REJECT detected');
    return { type: 'REJECT', confidence: 0.8 };
  }
  
  console.log('No clear ACCEPT/REJECT detected - marking as UNKNOWN ---> check and input nlp parse');
  return { type: 'UNKNOWN', confidence: 0.0 };
}