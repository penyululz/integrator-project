import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getApiRuntimeMode, listWorkspaceMembersQuery, type WorkspaceMemberRecord } from "../api";
import {
  Callout,
  FilterPills,
  InsightChip,
  LoadingInline,
  PageHeader,
  ProductToolbar,
  StatusPill,
  SurfaceCard,
} from "../components/ui-kit";

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
  const [query, setQuery] = useState("");

  const membersQuery = useQuery({
    queryKey: ["workspace-members", filter, query],
    queryFn: () =>
      listWorkspaceMembersQuery({
        limit: 50,
        search: query.trim() || undefined,
        status:
          filter === "active"
            ? "active"
            : filter === "invited"
              ? "invited"
              : undefined,
      }),
  });

  const members = useMemo(() => {
    const rows = membersQuery.data?.rows || [];
    if (filter === "admin") {
      return rows.filter((member) => member.role === "owner" || member.role === "admin");
    }
    return rows;
  }, [membersQuery.data?.rows, filter]);
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
        subtitle="View role status and member activity with list/query contracts shared across Prototype Mode and Live Mode."
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
        <label>
          Search members
          <input
            className="field-input"
            placeholder="Find by name, email, role, or team"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <FilterPills
          options={filterPills}
          value={filter}
          onChange={(next) => setFilter(next as typeof filter)}
        />
        {membersQuery.isLoading ? <LoadingInline label="Loading members..." /> : null}
        {membersQuery.error ? (
          <Callout tone="danger" title="Unable to load members">
            <p>{(membersQuery.error as Error).message}</p>
          </Callout>
        ) : null}
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
              {members.map((member) => (
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
    </div>
  );
}
