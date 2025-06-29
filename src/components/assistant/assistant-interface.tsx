
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Loader2, Mail, Volume2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { draftEmail, DraftEmailInput, DraftEmailOutput } from '@/ai/flows/draft-email';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';

type AssistantStatus = 
  | "idle" // Initial state, button to activate
  | "permission_pending" // Waiting for mic permission
  | "no_mic_support" // Mic not supported
  | "activating_wake_word" // Clicked activate, setting up wake word
  | "listening_wake_word" // Listening for "Hey Assistant"
  | "wake_word_detected" // "Hey Assistant" heard, listening for command
  | "listening_command" // Actively listening for user command
  | "processing_command" // Command received, calling AI
  | "speaking_feedback" // Assistant is speaking
  | "displaying_result" // Displaying AI result (e.g., email draft)
  | "error"; // An error occurred

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition | undefined;
    webkitSpeechRecognition: typeof SpeechRecognition | undefined;
  }
}

export default function AssistantInterface() {
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [draftedEmail, setDraftedEmail] = useState<DraftEmailOutput | null>(null);
  const [lastError, setLastError] = useState<string>("");
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);
  const isMountedRef = useRef(true); // To prevent state updates on unmounted component
  const { toast } = useToast();

  const speak = useCallback((text: string, onEndCallback?: () => void) => {
    if (!speechSynthesisRef.current || typeof SpeechSynthesisUtterance === 'undefined') {
      console.warn("Speech synthesis not available.");
      if (onEndCallback) onEndCallback();
      return;
    }
    setStatus("speaking_feedback");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      if (isMountedRef.current) {
        // Default back to listening for wake word after speaking, if applicable
        if (status !== "error" && status !== "no_mic_support" && status !== "idle") {
           // startWakeWordListener(); // Re-evaluate this logic
        }
      }
      if (onEndCallback) onEndCallback();
    };
    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      if (isMountedRef.current) {
        // setStatus("error"); // Avoid overwriting primary error
        // setLastError("Speech synthesis failed.");
      }
      if (onEndCallback) onEndCallback();
    };
    speechSynthesisRef.current.speak(utterance);
  }, [status]); // Added status to dependencies

  const startWakeWordListener = useCallback(() => {
    if (!isMountedRef.current || !recognitionRef.current) return;
    setTranscript("");
    setDraftedEmail(null);
    setStatus("listening_wake_word");
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;

    recognitionRef.current.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      const currentFinalTranscript = (finalTranscript || interimTranscript).toLowerCase().trim();
      setTranscript(currentFinalTranscript);

      if (currentFinalTranscript.includes("hey assistant")) {
        recognitionRef.current?.stop();
        setStatus("wake_word_detected");
        speak("Yes?", () => {
            if (isMountedRef.current) startCommandListener();
        });
      }
    };
    recognitionRef.current.onend = () => {
      if (isMountedRef.current && status === "listening_wake_word") {
        // Restart if ended unexpectedly while still in wake word listening mode
        setTimeout(() => recognitionRef.current?.start(), 100);
      }
    };
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.error("Error starting wake word recognition:", e);
      // This might happen if already started, or other issues.
    }
  }, [speak, status]); // Added status

  const startCommandListener = useCallback(() => {
    if (!isMountedRef.current || !recognitionRef.current) return;
    
    setTranscript(""); // Clear previous transcript
    setStatus("listening_command");
    recognitionRef.current.continuous = false; // Stop after first command
    recognitionRef.current.interimResults = false;

    recognitionRef.current.onresult = async (event: any) => {
      const command = event.results[0][0].transcript.trim();
      setTranscript(command);
      setStatus("processing_command");
      await processCommand(command);
    };

    recognitionRef.current.onend = () => {
      // If it ends without a result while listening for a command, go back to wake word.
      if (isMountedRef.current && status === "listening_command") {
        startWakeWordListener();
      }
    };
    try {
      recognitionRef.current.start();
    } catch(e) {
      console.error("Error starting command recognition:", e);
    }
  }, [status]); // Added status to ensure correct function is used

  const processCommand = async (command: string) => {
    const lowerCommand = command.toLowerCase();
    if (lowerCommand.startsWith("send email to") || lowerCommand.startsWith("draft email to")) {
      // Example: "send email to Utsav subject Project Update body Let's meet"
      // More robust parsing needed for real-world use
      const parts = lowerCommand.split(" ");
      const toIndex = parts.indexOf("to");
      let contactName = "default_contact"; // Default
      if (toIndex !== -1 && parts.length > toIndex + 1) {
        // Simplistic: assumes next word is name. Might need better parsing.
        contactName = parts[toIndex + 1]; 
        // Capitalize first letter
        contactName = contactName.charAt(0).toUpperCase() + contactName.slice(1);
      }
      
      // Extract subject and body if present
      let subject = "Following Up"; // Default subject
      let content = `Hi ${contactName},\n\nHope you are doing well.\n\nBest regards,\nAssistant`; // Default content
      
      const subjectIndex = lowerCommand.indexOf("subject ");
      const bodyIndex = lowerCommand.indexOf("body ");

      if (subjectIndex !== -1) {
          const endOfSubject = bodyIndex !== -1 && bodyIndex > subjectIndex ? bodyIndex : lowerCommand.length;
          subject = command.substring(subjectIndex + "subject ".length, endOfSubject).trim();
      }
      if (bodyIndex !== -1) {
          content = command.substring(bodyIndex + "body ".length).trim();
      }


      const emailInput: DraftEmailInput = { contactName, subject, content };
      
      try {
        speak(`Drafting an email to ${contactName}.`, async () => {
            if(!isMountedRef.current) return;
            const result = await draftEmail(emailInput);
            if (isMountedRef.current) {
                setDraftedEmail(result);
                setStatus("displaying_result");
                speak(`I've drafted an email to ${contactName}. You can see it on the screen.`, () => {
                    if(isMountedRef.current) startWakeWordListener();
                });
            }
        });
      } catch (error) {
        console.error("Error drafting email:", error);
        if (isMountedRef.current) {
            setLastError("Failed to draft email using AI.");
            setStatus("error");
            speak("Sorry, I couldn't draft the email.", () => {
                if(isMountedRef.current) startWakeWordListener();
            });
        }
      }
    } else {
        speak("Sorry, I didn't understand that command.", () => {
            if(isMountedRef.current) startWakeWordListener();
        });
    }
  };


  const initializeSpeechRecognition = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setStatus("no_mic_support");
      setLastError("Voice recognition is not supported by your browser.");
      return false;
    }
    
    recognitionRef.current = new SpeechRecognitionAPI();
    recognitionRef.current.lang = 'en-US';
    recognitionRef.current.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (isMountedRef.current) {
        let errorMsg = `Speech recognition error: ${event.error}.`;
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          errorMsg = "Microphone permission denied. Please enable it in your browser settings.";
          toast({ title: "Microphone Access Denied", description: errorMsg, variant: "destructive" });
        } else if (event.error === 'no-speech') {
          errorMsg = "No speech detected. Are you speaking clearly?";
          // Don't necessarily set to error state, might just restart listener
          // toast({ title: "No Speech Detected", description: errorMsg, variant: "destructive" });
        } else {
           toast({ title: "Speech Error", description: errorMsg, variant: "destructive" });
        }
        setLastError(errorMsg);
        setStatus("error"); // Set to error to show message, but might auto-restart
        // Attempt to restart wake word listener after an error, except for permission issues
        if (event.error !== 'not-allowed' && event.error !== 'permission-denied') {
          setTimeout(() => startWakeWordListener(), 1000);
        }
      }
    };
    return true;
  }, [toast, startWakeWordListener]);

  const handleActivateAssistant = async () => {
    if (status === "no_mic_support") return;

    setStatus("permission_pending");

    if (!recognitionRef.current) {
      if (!initializeSpeechRecognition()) {
        return; // Initialization failed (e.g. no API support)
      }
    }
    
    // Check for microphone permission
    try {
      // A common way to trigger permission prompt before starting recognition
      await navigator.mediaDevices.getUserMedia({ audio: true });
      // If successful, proceed to start wake word listener
      if (isMountedRef.current) {
        setStatus("activating_wake_word");
        speak("Assistant activated. Say 'Hey Assistant' to begin.", () => {
          if (isMountedRef.current) startWakeWordListener();
        });
      }
    } catch (err) {
      console.error("Microphone permission error:", err);
      if (isMountedRef.current) {
        setLastError("Microphone permission denied. Please enable microphone access.");
        setStatus("error");
        toast({ title: "Microphone Access Denied", description: "Please enable microphone access in your browser settings.", variant: "destructive" });
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (typeof window !== 'undefined') {
      speechSynthesisRef.current = window.speechSynthesis;
    }
    // Don't auto-initialize here, wait for user action
    return () => {
      isMountedRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
      if (speechSynthesisRef.current) {
        speechSynthesisRef.current.cancel();
      }
    };
  }, []);

  // UI Rendering
  let statusText = "";
  let micIconColor = "text-foreground/70"; // Default color
  let showPulsate = false;

  switch (status) {
    case "idle": statusText = "Click the button to activate your assistant."; break;
    case "permission_pending": statusText = "Waiting for microphone permission..."; micIconColor = "text-accent"; break;
    case "no_mic_support": statusText = "Voice recognition not supported. Try a different browser."; micIconColor = "text-destructive"; break;
    case "activating_wake_word": statusText = "Assistant activating..."; micIconColor = "text-primary"; showPulsate = true; break;
    case "listening_wake_word": statusText = "Listening for 'Hey Assistant'..."; micIconColor = "text-primary"; showPulsate = true; break;
    case "wake_word_detected": statusText = "Wake word detected!"; micIconColor = "text-accent"; break;
    case "listening_command": statusText = "Listening for your command..."; micIconColor = "text-accent"; showPulsate = true; break;
    case "processing_command": statusText = "Processing command..."; micIconColor = "text-yellow-500"; break; // Changed to yellow for processing
    case "speaking_feedback": statusText = "Assistant speaking..."; micIconColor = "text-primary"; break;
    case "displaying_result": statusText = "Task complete."; micIconColor = "text-green-500"; break; // Green for success
    case "error": statusText = `Error: ${lastError}`; micIconColor = "text-destructive"; break;
    default: statusText = "Assistant is ready.";
  }

  const isLoading = status === "processing_command" || status === "activating_wake_word" || status === "permission_pending";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-background text-foreground">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline">My Assistant</CardTitle>
          <CardDescription>Your personal voice-activated helper</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
          {status === "idle" || status === "error" || status === "no_mic_support" ? (
            <Button 
              onClick={handleActivateAssistant} 
              size="lg" 
              className="px-8 py-6 text-lg bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-lg"
              disabled={status === "no_mic_support"}
            >
              <Mic className="w-6 h-6 mr-2" /> Activate Assistant
            </Button>
          ) : (
            <div className={cn("rounded-full p-6 bg-card border-2", 
              status === "listening_wake_word" || status === "listening_command" ? "border-accent shadow-accent/50 shadow-lg" : "border-primary/30",
              showPulsate && "animate-pulsate"
            )}>
              <Mic className={cn("w-24 h-24", micIconColor)} />
            </div>
          )}

          <div className="w-full p-3 text-lg font-medium rounded-md bg-muted text-muted-foreground min-h-[50px] flex items-center justify-center">
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : statusText}
          </div>

          {transcript && (
            <div className="w-full p-3 text-sm italic border rounded-md bg-card border-border">
              <p className="text-foreground/80">You said: "{transcript}"</p>
            </div>
          )}
          
          {status === "no_mic_support" && (
             <div className="flex items-center p-3 text-sm text-destructive-foreground bg-destructive rounded-md">
                <AlertTriangle className="w-5 h-5 mr-2 shrink-0" /> {lastError}
             </div>
          )}
          {status === "error" && lastError && !lastError.toLowerCase().includes("no speech detected") && (
             <div className="flex items-center p-3 text-sm text-destructive-foreground bg-destructive rounded-md">
                <AlertTriangle className="w-5 h-5 mr-2 shrink-0" /> {lastError}
             </div>
          )}


          {draftedEmail && (
            <Card className="w-full mt-4 text-left bg-background border-primary/50 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center">
                  <Mail className="w-6 h-6 mr-3 text-primary" />
                  <CardTitle className="font-headline">Drafted Email</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => speak(`Email for ${draftedEmail.recipient}. Subject: ${draftedEmail.subject}. Body: ${draftedEmail.body}`)}>
                  <Volume2 className="w-5 h-5" /> <span className="sr-only">Read email</span>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <p><strong className="font-semibold">To:</strong> {draftedEmail.recipient}</p>
                <p><strong className="font-semibold">Subject:</strong> {draftedEmail.subject}</p>
                <div className="p-2 mt-1 text-sm border rounded-md bg-muted/50 border-border">
                  <strong className="block mb-1 font-semibold">Body:</strong>
                  <p className="whitespace-pre-wrap">{draftedEmail.body}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
