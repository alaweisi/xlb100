import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OA_PERMISSION_KEYS,
  type OaDelegationGrant,
  type OaMembership,
  type OaOrganization,
  type OaPermissionKey,
  type OaPrincipal,
  type OaRole,
} from "@xlb/types";
import { oa } from "./api";

type Props = {
  principal?: OaPrincipal;
  organizations: OaOrganization[];
  cityLabel: (cityCode: string) => string;
  onOrganizationsChanged: () => Promise<void>;
};

function requestKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function statusLabel(status: string): string {
  return {
    active: "启用",
    suspended: "暂停",
    revoked: "撤销",
    pending: "待复核",
    expired: "已过期",
  }[status] ?? status;
}

export function OrganizationAdministration({
  principal,
  organizations,
  cityLabel,
  onOrganizationsChanged,
}: Props) {
  const canRead = principal?.permissions.includes("oa.authorization.read") ?? false;
  const canManageAuthorization = principal?.permissions.includes("oa.authorization.manage") ?? false;
  const canManageOrganization = principal?.permissions.includes("oa.organization.manage") ?? false;
  const isHeadquarters = principal?.organization.organizationType === "headquarters";
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    principal?.organization.organizationId ?? "",
  );
  const [roles, setRoles] = useState<OaRole[]>([]);
  const [memberships, setMemberships] = useState<OaMembership[]>([]);
  const [delegations, setDelegations] = useState<OaDelegationGrant[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("OA 组织授权维护");
  const [branchCode, setBranchCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchCity, setBranchCity] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [roleName, setRoleName] = useState("");
  const [rolePermissions, setRolePermissions] = useState<OaPermissionKey[]>([]);
  const [adminUserId, setAdminUserId] = useState("");
  const [membershipRoleId, setMembershipRoleId] = useState("");
  const [delegationCity, setDelegationCity] = useState("");
  const [delegationPermission, setDelegationPermission] = useState<OaPermissionKey | "">("");

  const selectedOrganization = organizations.find(
    (organization) => organization.organizationId === selectedOrganizationId,
  );
  const organizationCities = useMemo(() => {
    if (!principal) return [];
    return principal.cityCodes.filter((cityCode) => {
      const organizationScope = principal.permissionCityCodes["oa.authorization.manage"] ?? [];
      return organizationScope.includes(cityCode);
    });
  }, [principal]);
  const assignablePermissions = useMemo(
    () => OA_PERMISSION_KEYS.filter((permission) => principal?.permissions.includes(permission)),
    [principal],
  );

  const load = useCallback(async () => {
    if (!canRead || !selectedOrganizationId) return;
    setBusy(true);
    setError(null);
    try {
      const [roleResponse, membershipResponse, delegationResponse] = await Promise.all([
        oa.listRoles(selectedOrganizationId),
        oa.listMemberships(selectedOrganizationId),
        oa.listDelegations(),
      ]);
      setRoles(roleResponse.roles);
      setMemberships(membershipResponse.memberships);
      setDelegations(delegationResponse.delegations);
      setMembershipRoleId((current) => (
        roleResponse.roles.some((role) => role.roleId === current)
          ? current
          : roleResponse.roles.find((role) => role.status === "active")?.roleId ?? ""
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "组织授权数据加载失败");
    } finally {
      setBusy(false);
    }
  }, [canRead, selectedOrganizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const firstCity = organizationCities[0] ?? "";
    setBranchCity((current) => current || firstCity);
    setDelegationCity((current) => current || firstCity);
  }, [organizationCities]);

  const run = async (operation: () => Promise<unknown>, success: string, refreshOrganizations = false) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      if (refreshOrganizations) await onOrganizationsChanged();
      await load();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "组织授权操作失败");
    } finally {
      setBusy(false);
    }
  };

  const createBranch = () => run(
    () => oa.createOrganization({
      organizationCode: branchCode.trim(),
      name: branchName.trim(),
      parentOrganizationId: principal!.organization.organizationId,
      cityCodes: [branchCity],
      reason,
      idempotencyKey: requestKey("oa-branch"),
    }),
    "分公司已创建；下一步请配置角色、成员和城市委派。",
    true,
  ).then(() => {
    setBranchCode("");
    setBranchName("");
  });

  const updateOrganizationStatus = (status: "active" | "suspended") => {
    if (!selectedOrganization) return Promise.resolve();
    return run(
      () => oa.updateOrganization(selectedOrganization.organizationId, {
        expectedVersion: selectedOrganization.version,
        status,
        reason,
        idempotencyKey: requestKey(`oa-organization-${status}`),
      }),
      status === "active" ? "分公司已启用。" : "分公司已暂停，现有委派已撤销。",
      true,
    );
  };

  const createRole = () => run(
    () => oa.createRole({
      organizationId: selectedOrganizationId,
      roleKey: roleKey.trim(),
      name: roleName.trim(),
      permissions: rolePermissions,
      reason,
      idempotencyKey: requestKey("oa-role"),
    }),
    "角色已创建。",
  ).then(() => {
    setRoleKey("");
    setRoleName("");
    setRolePermissions([]);
  });

  const createMembership = () => run(
    () => oa.createMembership({
      organizationId: selectedOrganizationId,
      adminUserId: adminUserId.trim(),
      roleIds: [membershipRoleId],
      reason,
      idempotencyKey: requestKey("oa-membership"),
    }),
    "成员已加入组织。",
  ).then(() => setAdminUserId(""));

  const createDelegation = () => run(
    () => oa.createDelegation({
      granteeOrganizationId: selectedOrganizationId,
      cityCode: delegationCity,
      permissionKey: delegationPermission as OaPermissionKey,
      reason,
      idempotencyKey: requestKey("oa-delegation"),
    }),
    "委派申请已提交，必须由另一名总部管理员复核。",
  );

  return (
    <section className="oa-page oa-administration">
      <div className="oa-page__header">
        <div>
          <h2>组织与权限</h2>
          <p>组织、成员、角色、城市委派和授权版本均由服务端校验并留下审计证据</p>
        </div>
        <button className="oa-secondary-button" disabled={busy || !canRead} onClick={() => void load()}>
          {busy ? "刷新中…" : "刷新授权数据"}
        </button>
      </div>

      {error && <div className="oa-alert" role="alert"><span>{error}</span></div>}
      {notice && <div className="oa-admin-notice" role="status">{notice}</div>}

      <div className="oa-admin-summary">
        <article>
          <span>当前身份</span>
          <strong>{principal?.username ?? "—"}</strong>
          <small>{principal?.organization.name}</small>
        </article>
        <article>
          <span>有效城市</span>
          <strong>{principal?.cityCodes.length ?? 0}</strong>
          <small>{principal?.cityCodes.map(cityLabel).join("、") || "无"}</small>
        </article>
        <article>
          <span>有效权限</span>
          <strong>{principal?.permissions.length ?? 0}</strong>
          <small>授权版本 v{principal?.authzVersion ?? 0}</small>
        </article>
        <article>
          <span>委派台账</span>
          <strong>{delegations.length}</strong>
          <small>{delegations.filter((item) => item.status === "pending").length} 项待复核</small>
        </article>
      </div>

      <div className="oa-admin-toolbar">
        <label>
          管理组织
          <select
            value={selectedOrganizationId}
            onChange={(event) => setSelectedOrganizationId(event.target.value)}
          >
            {organizations.map((organization) => (
              <option key={organization.organizationId} value={organization.organizationId}>
                {organization.name} · {statusLabel(organization.status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          操作理由
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
        </label>
        {isHeadquarters && canManageOrganization && selectedOrganization?.organizationType === "branch" && (
          <div className="oa-admin-toolbar__actions">
            <button
              className="oa-secondary-button"
              disabled={busy || selectedOrganization.status === "suspended"}
              onClick={() => void updateOrganizationStatus("suspended")}
            >
              暂停分公司
            </button>
            <button
              className="oa-primary-button"
              disabled={busy || selectedOrganization.status === "active"}
              onClick={() => void updateOrganizationStatus("active")}
            >
              启用分公司
            </button>
          </div>
        )}
      </div>

      {isHeadquarters && canManageOrganization && (
        <section className="oa-admin-section">
          <header><div><h3>新建分公司</h3><p>一个城市只能有一个活动分公司所有者</p></div></header>
          <div className="oa-admin-form oa-admin-form--four">
            <label>组织编码<input value={branchCode} onChange={(event) => setBranchCode(event.target.value)} placeholder="hangzhou-west" /></label>
            <label>组织名称<input value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="杭州西部分公司" /></label>
            <label>归属城市<select value={branchCity} onChange={(event) => setBranchCity(event.target.value)}>{organizationCities.map((cityCode) => <option key={cityCode} value={cityCode}>{cityLabel(cityCode)}</option>)}</select></label>
            <button className="oa-primary-button" disabled={busy || branchCode.trim().length < 2 || branchName.trim().length < 2 || !branchCity} onClick={() => void createBranch()}>创建分公司</button>
          </div>
        </section>
      )}

      <div className="oa-admin-columns">
        <section className="oa-admin-section">
          <header><div><h3>角色与权限</h3><p>{roles.length} 个角色</p></div></header>
          <div className="oa-admin-list">
            {roles.map((role) => (
              <article key={role.roleId}>
                <div><strong>{role.name}</strong><small>{role.roleKey} · v{role.version}</small></div>
                <span>{statusLabel(role.status)}</span>
                <p>{role.permissions.join(" · ")}</p>
                {canManageAuthorization && (
                  <button
                    className="oa-link-button"
                    disabled={busy}
                    onClick={() => void run(
                      () => oa.updateRole(role.roleId, {
                        expectedVersion: role.version,
                        status: role.status === "active" ? "suspended" : "active",
                        reason,
                        idempotencyKey: requestKey("oa-role-status"),
                      }),
                      role.status === "active" ? "角色已暂停。" : "角色已启用。",
                    )}
                  >
                    {role.status === "active" ? "暂停" : "启用"}
                  </button>
                )}
              </article>
            ))}
          </div>
          {canManageAuthorization && (
            <div className="oa-admin-create">
              <h4>创建最小权限角色</h4>
              <div className="oa-admin-form">
                <label>角色键<input value={roleKey} onChange={(event) => setRoleKey(event.target.value)} placeholder="dispatch_reviewer" /></label>
                <label>角色名称<input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="调度复核员" /></label>
              </div>
              <fieldset className="oa-permission-picker">
                <legend>权限</legend>
                {assignablePermissions.map((permission) => (
                  <label key={permission}>
                    <input
                      type="checkbox"
                      checked={rolePermissions.includes(permission)}
                      onChange={(event) => setRolePermissions((current) => (
                        event.target.checked
                          ? [...current, permission]
                          : current.filter((item) => item !== permission)
                      ))}
                    />
                    {permission}
                  </label>
                ))}
              </fieldset>
              <button className="oa-primary-button" disabled={busy || roleKey.trim().length < 2 || roleName.trim().length < 2 || rolePermissions.length === 0} onClick={() => void createRole()}>创建角色</button>
            </div>
          )}
        </section>

        <section className="oa-admin-section">
          <header><div><h3>组织成员</h3><p>{memberships.length} 名成员</p></div></header>
          <div className="oa-admin-list">
            {memberships.map((membership) => (
              <article key={membership.membershipId}>
                <div><strong>{membership.username ?? membership.userId}</strong><small>{membership.membershipId} · 授权 v{membership.authzVersion}</small></div>
                <span>{statusLabel(membership.status)}</span>
                <p>{membership.roles?.map((role) => role.name).join(" · ") || "未绑定角色"}</p>
                {canManageAuthorization && membership.membershipId !== principal?.membershipId && (
                  <button
                    className="oa-link-button"
                    disabled={busy}
                    onClick={() => void run(
                      () => oa.updateMembership(membership.membershipId, {
                        expectedAuthzVersion: membership.authzVersion,
                        status: membership.status === "active" ? "suspended" : "active",
                        reason,
                        idempotencyKey: requestKey("oa-member-status"),
                      }),
                      membership.status === "active" ? "成员已暂停并撤销会话。" : "成员已启用。",
                    )}
                  >
                    {membership.status === "active" ? "暂停" : "启用"}
                  </button>
                )}
              </article>
            ))}
          </div>
          {canManageAuthorization && (
            <div className="oa-admin-create">
              <h4>添加现有 Admin 身份</h4>
              <div className="oa-admin-form">
                <label>Admin 用户 ID<input value={adminUserId} onChange={(event) => setAdminUserId(event.target.value)} /></label>
                <label>初始角色<select value={membershipRoleId} onChange={(event) => setMembershipRoleId(event.target.value)}>{roles.filter((role) => role.status === "active").map((role) => <option key={role.roleId} value={role.roleId}>{role.name}</option>)}</select></label>
              </div>
              <button className="oa-primary-button" disabled={busy || !adminUserId.trim() || !membershipRoleId} onClick={() => void createMembership()}>添加成员</button>
            </div>
          )}
        </section>
      </div>

      <section className="oa-admin-section">
        <header><div><h3>总部委派台账</h3><p>申请、独立复核、启用和撤销全过程留痕</p></div></header>
        <div className="oa-admin-list oa-admin-list--delegations">
          {delegations.map((delegation) => (
            <article key={delegation.grantId}>
              <div>
                <strong>{delegation.permissionKey}</strong>
                <small>{cityLabel(delegation.cityCode)} · {delegation.granteeOrganizationId}</small>
              </div>
              <span>{statusLabel(delegation.status)}</span>
              <p>{delegation.reason}</p>
              {canManageAuthorization && isHeadquarters && delegation.status === "pending" && (
                <button
                  className="oa-primary-button"
                  disabled={busy || delegation.grantedByMembershipId === principal?.membershipId}
                  title={delegation.grantedByMembershipId === principal?.membershipId ? "申请人不能审批自己的委派" : "独立复核"}
                  onClick={() => void run(
                    () => oa.approveDelegation(delegation.grantId, {
                      expectedVersion: delegation.version,
                      reason,
                      idempotencyKey: requestKey("oa-grant-approve"),
                    }),
                    "委派已通过独立复核并生效。",
                  )}
                >
                  复核通过
                </button>
              )}
              {canManageAuthorization && isHeadquarters && delegation.status === "active" && (
                <button
                  className="oa-secondary-button"
                  disabled={busy}
                  onClick={() => void run(
                    () => oa.revokeDelegation(delegation.grantId, {
                      expectedVersion: delegation.version,
                      reason,
                      idempotencyKey: requestKey("oa-grant-revoke"),
                    }),
                    "委派已撤销，分公司会话已失效。",
                  )}
                >
                  撤销
                </button>
              )}
            </article>
          ))}
          {delegations.length === 0 && <p className="oa-admin-empty">当前授权城市没有委派记录。</p>}
        </div>
        {canManageAuthorization && isHeadquarters && selectedOrganization?.organizationType === "branch" && (
          <div className="oa-admin-create">
            <h4>发起城市权限委派</h4>
            <div className="oa-admin-form oa-admin-form--four">
              <label>城市<select value={delegationCity} onChange={(event) => setDelegationCity(event.target.value)}>{organizationCities.map((cityCode) => <option key={cityCode} value={cityCode}>{cityLabel(cityCode)}</option>)}</select></label>
              <label>权限<select value={delegationPermission} onChange={(event) => setDelegationPermission(event.target.value as OaPermissionKey)}><option value="">选择权限</option>{assignablePermissions.map((permission) => <option key={permission} value={permission}>{permission}</option>)}</select></label>
              <span className="oa-admin-form__hint">委派提交后不会立即生效，必须由另一名总部管理员复核。</span>
              <button className="oa-primary-button" disabled={busy || !delegationCity || !delegationPermission} onClick={() => void createDelegation()}>提交委派</button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
