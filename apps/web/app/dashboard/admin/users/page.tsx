"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface User {
  id: string;
  email: string;
  username: string;
  status: string;
  emailVerified: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<User[]>("/api/v1/users?limit=100");
      if (res.error) setError(res.error.message);
      else setUsers(res.data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-text-muted text-sm">Loading users…</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-1">Users</h1>
      <p className="text-sm text-text-muted mb-6">All accounts across the platform.</p>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-sm text-text-muted">
          No users found.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-subtle text-text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Username</th>
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Verified</th>
                <th className="text-left px-4 py-2 font-medium">Last login</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-2 font-medium">{u.username}</td>
                  <td className="px-4 py-2 text-text-muted">{u.email}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      u.status === "active" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    }`}>{u.status}</span>
                  </td>
                  <td className="px-4 py-2 text-text-muted text-xs">
                    {u.emailVerified ? "✓" : "—"}
                  </td>
                  <td className="px-4 py-2 text-text-muted text-xs">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "never"}
                  </td>
                  <td className="px-4 py-2 text-text-muted text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
