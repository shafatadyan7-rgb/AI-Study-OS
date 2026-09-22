import { NextResponse } from 'next/server';
import { db } from '@/db';
import { careerPaths } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { isPresentable, isStale } from '@/lib/career/data';
import { handleError } from '@/lib/http';

/**
 * Read-only, curriculum-adjacent reference data — never generated per-request.
 * An entry without a source citation is filtered out rather than shown as if
 * verified; a stale entry is still shown but flagged, since "unavailable" and
 * "old" call for different UI treatment.
 */
export async function GET() {
  try {
    await requireUser();
    const rows = await db.query.careerPaths.findMany();

    const presentable = rows.filter((r) => isPresentable({
      id: r.id, name: r.name, summary: r.summary,
      requiredSubjects: r.requiredSubjects, relatedSkills: r.relatedSkills,
      educationPath: r.educationPath, sourceUrl: r.sourceUrl, sourceLabel: r.sourceLabel,
      lastVerifiedAt: r.lastVerifiedAt,
    }));

    return NextResponse.json(presentable.map((r) => ({
      id: r.id, name: r.name, summary: r.summary,
      requiredSubjects: r.requiredSubjects, relatedSkills: r.relatedSkills,
      educationPath: r.educationPath, sourceUrl: r.sourceUrl, sourceLabel: r.sourceLabel,
      stale: isStale({
        id: r.id, name: r.name, summary: r.summary, requiredSubjects: r.requiredSubjects,
        relatedSkills: r.relatedSkills, educationPath: r.educationPath,
        sourceUrl: r.sourceUrl, sourceLabel: r.sourceLabel, lastVerifiedAt: r.lastVerifiedAt,
      }),
    })));
  } catch (err) {
    return handleError(err, 'api.career.failed');
  }
}
