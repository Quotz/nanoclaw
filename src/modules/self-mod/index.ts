/**
 * Self-modification module — admin-approved container + host-service mutations.
 *
 * Optional tier. Depends on the approvals default module for the request/
 * handler plumbing. On install the module registers:
 *   - Delivery actions that validate input and queue an approval via
 *     requestApproval().
 *   - Matching approval handlers that run on approve and perform the
 *     complete follow-up:
 *       install_packages → update container.json, rebuild image, kill
 *         container (next wake respawns on the new image), schedule a
 *         verify-and-report follow-up prompt.
 *       add_mcp_server → update container.json, kill container. No image
 *         rebuild — bun runs TS directly, so the new MCP server is wired
 *         by the next container start.
 *       patch_bridge → apply a unified diff to /opt/taskosaur-mcp/, restart
 *         the systemd service, health-check, commit + push, bounce the
 *         agent container so its MCP SDK re-lists tools. Reverts cleanly
 *         on any failure.
 *
 * Without this module: the MCP tools in the container still write outbound
 * system messages with these actions, but delivery logs "Unknown system
 * action" and drops them. Admin never sees a card; nothing changes.
 */
import { registerDeliveryAction } from '../../delivery.js';
import { registerApprovalHandler } from '../approvals/index.js';
import { applyAddMcpServer, applyInstallPackages, applyPatchBridge } from './apply.js';
import { handleAddMcpServer, handleInstallPackages, handlePatchBridge } from './request.js';

registerDeliveryAction('install_packages', handleInstallPackages);
registerDeliveryAction('add_mcp_server', handleAddMcpServer);
registerDeliveryAction('patch_bridge', handlePatchBridge);

registerApprovalHandler('install_packages', applyInstallPackages);
registerApprovalHandler('add_mcp_server', applyAddMcpServer);
registerApprovalHandler('patch_bridge', applyPatchBridge);
