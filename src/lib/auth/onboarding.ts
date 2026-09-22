import { z } from 'zod';

/**
 * Signup collects only what the product actually uses. The spec is explicit
 * about not collecting unnecessary personal information, so there is
 * deliberately no field here for anything beyond identity and study context.
 */
export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Use at least 8 characters.'),
  displayName: z.string().min(1).max(80),
  role: z.enum(['student', 'teacher', 'parent']).default('student'),
  classLabel: z.string().max(40).optional(),
  preferredLanguage: z.enum(['en', 'bn', 'mixed']).default('en'),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
