# MCP Access Request Template

## Request Information

**Requestor Name**: [Your Full Name]
**Requestor Role**: [Your Agent Role]
**Date**: [YYYY-MM-DD]
**Request ID**: [Auto-generated or manual ID]

## Service Details

### 1. MCP Server Information

**Service Name**: [Name of MCP server/service]
**Service Description**: [Brief description of what the service does]
**Service URL**: [Full URL if applicable]
**Transport Protocol**: [HTTP/HTTPS/WebSocket/etc.]

### 2. Purpose and Justification

**Business Purpose**: [Explain why this service is needed for business operations]
**Specific Use Cases**: [List specific scenarios where this service will be used]
**Expected Benefits**: [What value will this service provide?]

**Justification**: [Detailed explanation of why this specific service is required]
- What business needs does it address?
- Are there alternative solutions? If so, why is this preferred?
- What is the impact of not having this access?

## Access Requirements

### 3. Domain Access

**Required Domains**: [List all domains needed, one per line]
- Example: https://api.example.com
- Example: https://docs.example.com

**Domain Justification**: [Explain why each domain is required]
- For each domain, explain:
  - What functionality requires this domain?
  - What data will be accessed?
  - What operations will be performed?

### 4. Access Scope

**Tools/Functions Required**: [List specific tools or functions needed]
**Data Access Required**: [What data will be accessed?]
**Write Access Needed**: [Yes/No - Will data be modified?]
**API Keys/Secrets Required**: [Yes/No - Will credentials be needed?]

## Security Considerations

### 5. Security Assessment

**Security Risks**: [Identify potential security risks]
**Mitigation Strategies**: [How will risks be mitigated?]
**Data Sensitivity**: [What is the sensitivity level of data accessed?]
**Compliance Requirements**: [Any regulatory or compliance considerations?]

### 6. Security Controls

**Authentication**: [How will authentication be handled?]
**Authorization**: [How will access be controlled?]
**Audit Logging**: [What logging will be implemented?]
**Monitoring**: [How will usage be monitored?]

## Implementation Plan

### 7. Implementation Details

**Implementation Timeline**: [When will this be needed?]
**Testing Requirements**: [What testing is needed before production?]
**Rollout Plan**: [How will this be deployed?]
**Backup Plan**: [What if this service becomes unavailable?]

### 8. Support and Maintenance

**Support Responsibility**: [Who will support this service?]
**Maintenance Requirements**: [What maintenance is needed?]
**Incident Response**: [How will incidents be handled?]

## Approval Section

### 9. Review and Approval

**Security Director Review**:
- [ ] Request received
- [ ] Security assessment completed
- [ ] Risk analysis performed
- [ ] Approval decision made

**Approval Decision**: [Approve/Deny/Request More Information]
**Approver Name**: [Security Director Name]
**Approval Date**: [YYYY-MM-DD]
**Approval Comments**: [Rationale for decision]

**CEO Escalation** (if needed):
- [ ] Escalated to CEO
- [ ] CEO approval obtained
- [ ] CEO comments: [Any additional requirements]

## Compliance and Documentation

### 10. Compliance Requirements

**Policy Compliance**: [List policies this request complies with]
**Regulatory Compliance**: [List any regulatory requirements]
**Documentation Requirements**: [What documentation is needed?]

### 11. Post-Implementation

**Review Schedule**: [When will access be reviewed?]
**Sunset Date**: [When should access be re-evaluated?]
**Success Metrics**: [How will success be measured?]
**Lessons Learned**: [Space for post-implementation review]

---

## Instructions for Requestors

1. **Complete Thoroughly**: Fill out all sections completely and accurately
2. **Be Specific**: Provide detailed information about requirements
3. **Justify Needs**: Clearly explain why each access is required
4. **Consider Security**: Think about security implications
5. **Submit via Swarm Bus**: Send completed request to Security Director
6. **Wait for Approval**: Do not proceed without approval
7. **Implement Safely**: Follow security guidelines during implementation
8. **Monitor Usage**: Keep track of service usage and report issues

## Security Director Guidelines

1. **Review Timeline**: Aim to review within 24-48 hours
2. **Risk Assessment**: Evaluate risk vs. benefit
3. **Least Privilege**: Grant minimum access needed
4. **Document Decisions**: Record rationale for all decisions
5. **Communicate Clearly**: Provide clear feedback to requestors
6. **Follow Up**: Ensure implementation follows approval terms
7. **Audit Regularly**: Review access periodically

---

**Template Version**: 1.0
**Last Updated**: 2024-03-01
**Maintained By**: Security Director