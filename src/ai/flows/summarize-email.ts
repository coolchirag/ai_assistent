'use server';

/**
 * @fileOverview Summarizes the last email from a specified contact.
 *
 * - summarizeEmailFromVoiceCommand - A function that summarizes the last email from a contact.
 * - SummarizeEmailFromVoiceCommandInput - The input type for the summarizeEmailFromVoiceCommand function.
 * - SummarizeEmailFromVoiceCommandOutput - The return type for the summarizeEmailFromVoiceCommand function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeEmailFromVoiceCommandInputSchema = z.object({
  contactName: z.string().describe('The name of the contact to summarize the last email from.'),
});
export type SummarizeEmailFromVoiceCommandInput = z.infer<
  typeof SummarizeEmailFromVoiceCommandInputSchema
>;

const SummarizeEmailFromVoiceCommandOutputSchema = z.object({
  summary: z.string().describe('A brief summary of the last email from the specified contact.'),
});
export type SummarizeEmailFromVoiceCommandOutput = z.infer<
  typeof SummarizeEmailFromVoiceCommandOutputSchema
>;

export async function summarizeEmailFromVoiceCommand(
  input: SummarizeEmailFromVoiceCommandInput
): Promise<SummarizeEmailFromVoiceCommandOutput> {
  return summarizeEmailFromVoiceCommandFlow(input);
}

const summarizeEmailFromVoiceCommandPrompt = ai.definePrompt({
  name: 'summarizeEmailFromVoiceCommandPrompt',
  input: {schema: SummarizeEmailFromVoiceCommandInputSchema},
  output: {schema: SummarizeEmailFromVoiceCommandOutputSchema},
  prompt: `Summarize the last email from {{contactName}}. Provide a brief summary of the email content.`,
});

const summarizeEmailFromVoiceCommandFlow = ai.defineFlow(
  {
    name: 'summarizeEmailFromVoiceCommandFlow',
    inputSchema: SummarizeEmailFromVoiceCommandInputSchema,
    outputSchema: SummarizeEmailFromVoiceCommandOutputSchema,
  },
  async input => {
    const {output} = await summarizeEmailFromVoiceCommandPrompt(input);
    return output!;
  }
);
