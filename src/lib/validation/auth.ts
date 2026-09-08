import { z } from 'zod';

export const SignInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Only a length floor here. Complexity rules belong on the change-password
  // form; rejecting a correct password at sign-in helps nobody.
  password: z.string().min(8).max(200),
});

export type SignInInput = z.infer<typeof SignInSchema>;
