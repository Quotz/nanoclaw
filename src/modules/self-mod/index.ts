/**
 * Self-modification module — container + host-service mutations.
 *
 * Two flavors:
 *   - **Admin-gated** (install_packages, add_mcp_server): delivery action
 *     queues an approval card; approval handler runs the change on click.
 *   - **Autonomous** (patch_bridge): delivery action runs the change
 *     immediately (validate → apply → health-check → commit + push →
 *     auto-revert on failure). Admin receives a post-hoc Matrix message
 *     with the commit URL. Safety net is structural, not human-in-loop.
 *
 * Without this module: the MCP tools in the container still write outbound
 * system messages with these actions, but delivery logs "Unknown system
 * action" and drops them. Nothing changes.
 */
import { registerDeliveryAction } from '../../delivery.js';
import { registerApprovalHandler } from '../approvals/index.js';
import { applyAddMcpServer, applyInstallPackages } from './apply.js';
import { handleAddMcpServer, handleInstallPackages, handlePatchBridge } from './request.js';

registerDeliveryAction('install_packages', handleInstallPackages);
registerDeliveryAction('add_mcp_server', handleAddMcpServer);
registerDeliveryAction('patch_bridge', handlePatchBridge);

registerApprovalHandler('install_packages', applyInstallPackages);
registerApprovalHandler('add_mcp_server', applyAddMcpServer);
// patch_bridge has NO approval handler — its delivery action applies directly.
