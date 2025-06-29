'use server';

/**
 * @fileOverview Drafts an email based on a voice command.
 *
 * - draftEmail - A function that handles the email drafting process.
 * - DraftEmailInput - The input type for the draftEmail function.
 * - DraftEmailOutput - The return type for the draftEmail function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DraftEmailInputSchema = z.object({
  contactName: z.string().describe('The name of the contact to send the email to.'),
  subject: z.string().describe('The subject of the email.'),
  content: z.string().describe('The content of the email.'),
});
export type DraftEmailInput = z.infer<typeof DraftEmailInputSchema>;

const DraftEmailOutputSchema = z.object({
  recipient: z.string().describe('The recipient of the email.'),
  subject: z.string().describe('The subject of the email.'),
  body: z.string().describe('The body of the email.'),
});
export type DraftEmailOutput = z.infer<typeof DraftEmailOutputSchema>;

export async function draftEmail(input: DraftEmailInput): Promise<DraftEmailOutput> {
  return draftEmailFlow(input);
}

const prompt = ai.definePrompt({
  name: 'draftEmailPrompt',
  input: {schema: DraftEmailInputSchema},
  output: {schema: DraftEmailOutputSchema},
  prompt: `You are an AI assistant that drafts emails based on user voice commands.

  Compose an email to {{{contactName}}} with the subject '{{{subject}}}' and the following content: {{{content}}}.

  The email should be well-written and professional.
  `,
});

const draftEmailFlow = ai.defineFlow(
  {
    name: 'draftEmailFlow',
    inputSchema: DraftEmailInputSchema,
    outputSchema: DraftEmailOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
