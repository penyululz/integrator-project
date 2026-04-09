import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getApiRuntimeMode } from "../api";
import {
  Callout,
  FilterPills,
  InsightChip,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";
import {
  getWorkspaceMembers,
  type WorkspaceMemberRecord,
} from "./workspace-future-helpers";

const MEMBER_FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "invited", label: "Invited" },
  { id: "admin", label: "Admins" },
] as const;

function toMemberTone(status: WorkspaceMemberRecord["status"]): "success" | "warning" | "danger" {
  if (status === "active") {
    return "success";
  }
  if (status === "invited") {
    return "warning";
  }
  return "danger";
}

export function OrganizationPage() {
  const mode = getApiRuntimeMode();
  const [filter, setFilter] = useState<(typeof MEMBER_FILTERS)[number]["id"]>("all");
  const members = useMemo(() => getWorkspaceMembers(), []);

  const visibleMembers = useMemo(() => {
    if (filter === "active") {
      return members.filter((member) => member.status === "active");
    }
    if (filter === "invited") {
      return members.filter((member) => member.status === "invited");
    }
    if (filter === "admin") {
      return members.filter((member) => member.role === "owner" || member.role === "admin");
    }
    return members;
  }, [filter, members]);

  const filterPills = useMemo(
    () =>
      MEMBER_FILTERS.map((option) => ({
        id: option.id,
        label: option.label,
        count:
          option.id === "all"
            ? members.length
            : option.id === "active"
              ? members.filter((member) => member.status === "active").length
              : option.id === "invited"
                ? members.filter((member) => member.status === "invited").length
                : members.filter((member) => member.role === "owner" || member.role === "admin")
                    .length,
      })),
    [members],
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Organization"
        title="Workspace Team Console"
        subtitle="View member status, team assignments, and approval-ready operator roles in one place."
      />
      <ProductToolbar
        left={
          <>
            <InsightChip label="Mode" value={mode} />
            <InsightChip label="Members" value={members.length} />
          </>
        }
        right={
          <>
            <Link to="/approvals">Approvals</Link>
            <Link to="/audit-logs">Audit logs</Link>
          </>
        }
      />

      <SurfaceCard title="Members" subtitle="Team-aware visibility with role and status context.">
        <FilterPills options={filterPills} value={filter} onChange={(next) => setFilter(next as typeof filter)} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Team</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => (
                <tr key={member.id}>
                  <td>{member.fullName}</td>
                  <td>{member.email}</td>
                  <td>{member.team}</td>
                  <td>
                    <span className="tag">{member.role}</span>
                  </td>
                  <td>
                    <StatusPill tone={toMemberTone(member.status)}>{member.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <Callout tone="info" title="UI-ready collaboration layer">
        <p>
          Organization UX is now available in apps/web and linked into governance routes.
          Advanced membership administration remains runtime-light until dedicated APIs are expanded.
        </p>
      </Callout>
    </div>
  );
}
