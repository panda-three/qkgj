import { requireSession } from '@/lib/auth/guard';
import { getOppBoard, countOpportunities } from '@/server/services/oppQuery';
import { PageHeader } from '@/components/ui/Layout';
import { OppBoardClient, type OppRowView } from './OppBoardClient';
import type { OppStage } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OpportunitiesPage() {
  const session = await requireSession();

  const user = {
    userId: session.userId,
    role: session.role,
    deptId: session.deptId,
    deptName: session.deptName,
    name: session.name,
    employeeNo: session.employeeNo,
  };

  const [rows, counts] = await Promise.all([
    getOppBoard(user),
    countOpportunities(user),
  ]);

  const cards: OppRowView[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    customerName: r.customerName,
    phone: r.phone,
    amount: r.amount,
    stage: r.stage as OppStage,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    deptName: r.deptName,
    courseName: r.courseName,
    stageEnteredAt: r.stageEnteredAt,
    expectedCloseDate: r.expectedCloseDate,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="商机管理"
        description="跟进中超 3 天、谈判中超 7 天标记为阶段超期 · 拖拽卡片可推进阶段"
      />
      <OppBoardClient initialRows={cards} counts={counts ?? {}} role={session.role} />
    </div>
  );
}