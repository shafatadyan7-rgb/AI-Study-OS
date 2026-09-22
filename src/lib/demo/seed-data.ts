/**
 * Deterministic carnival demo content.
 *
 * This is ORIGINAL educational text written for the demo, not an excerpt from
 * any published textbook — a demo corpus must not be a redistribution of
 * copyrighted NCTB material.
 *
 * Every record created from this seed is written with `isDemo: true` and is
 * owned by the demo account, so demo data can never be confused with, or mixed
 * into, a real student's learning history.
 */
export const DEMO_BANNER = 'DEMO DATA — not a real student record';

export const DEMO_TEXTBOOK_TITLE = 'Demo Physics — Motion and Force (sample)';

export interface DemoPage { pageNumber: number; text: string; }

export const DEMO_PAGES: DemoPage[] = [
  {
    pageNumber: 1,
    text: `Chapter 1: Motion. Motion is a change in the position of an object with respect to a reference point over time. To describe motion precisely we need two ideas that are easy to confuse. Distance is defined as the total length of the path an object actually travels. Displacement is defined as the straight-line change in position from start to finish, together with its direction. A runner completing one lap of a 400 metre track covers a distance of 400 metres but has a displacement of zero, because the start and finish points are the same.`,
  },
  {
    pageNumber: 2,
    text: `1.2 Speed and Velocity. Speed is defined as the distance travelled per unit time. Velocity is defined as the rate of change of displacement, and because displacement has direction, velocity has direction too. This is why a car moving at a constant 60 km/h around a bend has constant speed but changing velocity. Average speed = total distance / total time. Average velocity = total displacement / total time.`,
  },
  {
    pageNumber: 3,
    text: `1.3 Acceleration. Acceleration is defined as the rate of change of velocity with respect to time. If velocity increases the acceleration is positive; if velocity decreases the acceleration is negative, which is often called deceleration or retardation. The unit of acceleration is metres per second squared. A body moving with uniform velocity has zero acceleration, because its velocity is not changing at all.`,
  },
  {
    pageNumber: 4,
    text: `Chapter 2: Force. Force is defined as a push or a pull that can change the state of motion of an object. Newton's first law states that an object remains at rest, or continues in uniform motion in a straight line, unless acted upon by an unbalanced external force. This tendency to resist a change in motion is called inertia, and inertia depends on mass.`,
  },
  {
    pageNumber: 5,
    text: `2.2 Newton's Second Law. The second law states that the acceleration produced in a body is directly proportional to the applied force and inversely proportional to its mass. This gives the relation F = ma, where F is force in newtons, m is mass in kilograms and a is acceleration in metres per second squared. Worked example: a force of 20 N acts on a body of mass 4 kg. Then a = F / m = 20 / 4 = 5 m/s².`,
  },
];

/** The scripted demo path, used by Presentation Mode to drive the story. */
export const DEMO_SCRIPT: { step: number; label: string; detail: string }[] = [
  { step: 1, label: 'Upload', detail: 'The demo textbook is processed through the real pipeline.' },
  { step: 2, label: 'Understand', detail: 'Chapters, sections and concepts are extracted from the text.' },
  { step: 3, label: 'Ask', detail: 'Ask: "What is the difference between distance and displacement?"' },
  { step: 4, label: 'Ground', detail: 'The answer cites page 1, retrieved from the real index.' },
  { step: 5, label: 'Notes', detail: 'Generate chapter notes from the same evidence.' },
  { step: 6, label: 'Quiz', detail: 'Generate a quiz on Motion.' },
  { step: 7, label: 'Miss one', detail: 'Answer the velocity question incorrectly — on purpose.' },
  { step: 8, label: 'Mistake Lab', detail: 'The mistake is recorded and classified.' },
  { step: 9, label: 'Weakness', detail: 'Velocity is identified as the weakest concept.' },
  { step: 10, label: 'Practise', detail: 'Targeted practice is generated from that mistake.' },
  { step: 11, label: 'Mastery', detail: 'Mastery moves — but not to MASTERED, because evidence is still thin.' },
  { step: 12, label: 'Plan', detail: 'The planner schedules revision and explains why.' },
  { step: 13, label: 'Analytics', detail: 'Progress appears; thin metrics honestly read NOT ENOUGH DATA.' },
];

export const DEMO_QUESTION = 'What is the difference between distance and displacement?';
