# MCP Server Access Control Procedures

## Overview
This document outlines the procedures for managing MCP server access and domain permissions.

## 1. Access Request Process

### 1.1 Submission
All MCP access requests must be submitted via Swarm Bus to the Security Director.

Required information in each request:
- **Service Name**: Name of the MCP server/service
- **Purpose**: Clear justification for the service
- **Domains**: Specific domains required for access
- **Security Considerations**: Any security implications or mitigations
- **Requestor**: Agent role making the request

### 1.2 Review Criteria
Security Director evaluates requests based on:

1. **Business Necessity**: Is the service required for core operations?
2. **Least Privilege**: Are the requested domains minimal and necessary?
3. **Security Risk**: What potential risks does the service introduce?
4. **Compliance**: Does the request comply with existing security policies?

## 2. Approval Workflow

### 2.1 Initial Review
- Security Director reviews all requests within 24 hours
- Requests may be approved, denied, or requested for additional information

### 2.2 Approval Decision
When approving a request, Security Director:
1. Documents the approval decision with rationale
2. Updates MCP configuration files
3. Notifies requestor of approval
4. Adds entry to access audit log

### 2.3 Denial Decision
When denying a request, Security Director:
1. Provides clear reasoning for denial
2. Suggests alternatives if applicable
3. Documents the denial in audit log
4. Notifies requestor with rationale

## 3. Configuration Management

### 3.1 Configuration Files
MCP server configurations are managed in:
- `.vibe/config.toml` - Main MCP server definitions
- `.vibe/trusted_folders.toml` - Folder trust configurations

### 3.2 Update Procedure
1. Review current configuration
2. Add/remove MCP server entries as needed
3. Update trusted/untrusted folder lists
4. Verify changes with `git status`
5. Commit changes with proper documentation

## 4. Monitoring and Compliance

### 4.1 Regular Audits
- Conduct weekly reviews of all MCP access
- Verify compliance with least privilege principle
- Identify and remove unused access

### 4.2 Access Reviews
- Quarterly review of all agent access levels
- Adjust permissions based on role changes
- Remove access for inactive agents

### 4.3 Incident Response
- Any unauthorized access attempt triggers immediate investigation
- Suspicious activity reported to CEO
- Access revoked pending investigation completion

## 5. Escalation Procedures

### 5.1 Security Threats
- Immediate escalation to CEO for confirmed threats
- Temporary access suspension during investigation
- Full audit trail maintained

### 5.2 Policy Violations
- Document all violations with timestamps
- Implement corrective actions
- Escalate repeat violations to CEO

## 6. Documentation Requirements

All access changes must be documented with:
- Date and time of change
- Requestor information
- Approver information
- Rationale for decision
- Specific changes made
- Impact assessment

## 7. Training and Awareness

### 7.1 Agent Training
- All agents trained on MCP access policies
- Regular refresher training conducted
- New agents receive training during onboarding

### 7.2 Security Awareness
- Monthly security awareness updates
- Phishing and social engineering training
- Prompt injection awareness training
