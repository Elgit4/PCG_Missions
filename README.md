# PCG Missions — ChurchConnect

This repository contains the requirements and design artefacts for ChurchConnect, a single-church New Members Follow-up and Retention Management System.

## Current project baseline

- One church, with an estimated 20–50 new visitors per month.
- Two application roles: Church Administrator and Mission Member.
- Visitor registration is performed by authorized church personnel (Welcome Team duties are assigned to Mission Members).
- The Church Administrator creates accounts, assigns access and manually assigns visitors to Mission Members.
- Follow-up channels include phone calls, SMS and personal visits.
- SMS supports manual sending and scheduled automated messages, with consent checks and delivery-status tracking.
- Follow-up scheduling, visitor response tracking, alerts/escalation, workload monitoring and team collaboration are in scope.
- Proposed stack: React, TypeScript, Supabase and PostgreSQL; responsive PWA.

## Documentation

See [ChurchConnect Software Requirements Specification v1.0](docs/ChurchConnect_SRS_v1.0.docx) for the current requirements baseline.

The SRS is a draft for stakeholder review. Church-specific schedules, SMS provider selection, sender ID approval, and operational/legal details require confirmation before implementation.
