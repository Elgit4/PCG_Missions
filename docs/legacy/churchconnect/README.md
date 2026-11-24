# Archived ChurchConnect database artifacts

These files are preserved for historical reference only. They implement the superseded two-role ChurchConnect model, not CMI Follow-up v2.1.

They have deliberately been moved outside Supabase's active `supabase/migrations` and `supabase/tests` discovery paths so a local CMI backend setup cannot accidentally apply or execute them.

Do not restore these files to active migration/test directories or apply them to a CMI database. The CMI schema must be generated from the approved CMI data dictionary, reconciled ERD, stakeholder decisions and RLS test plan.

Archived:
- `migrations/20261107001200_churchconnect_core_schema.sql`
- `migrations/20261107001300_churchconnect_rls_and_audit.sql`
- `migrations/20261107170000_churchconnect_sensitive_access_and_history.sql`
- `tests/churchconnect_rls.test.sql`
- `churchconnect-db-tests.yml`
