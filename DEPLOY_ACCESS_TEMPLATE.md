# Deploy Access Template

Copy the structure below into:

- `.local/DEPLOY_ACCESS.md`

Do not commit secrets.

## Railway

Project ID:
`<PROJECT_ID>`

Project-scoped token:
`<PROJECT_SCOPED_TOKEN>`

Service ID:
`<SERVICE_ID>`

Environment ID:
`<ENVIRONMENT_ID>`

Public URL:
`<PUBLIC_URL>`

Notes:
- project-scoped tokens may not work with account-wide CLI calls
- document the working GraphQL flow here

## Vercel

Token:
`<VERCEL_TOKEN>`

Scope:
`<VERCEL_SCOPE>`

Project ID:
`<VERCEL_PROJECT_ID>`

Org ID:
`<VERCEL_ORG_ID>`

Project name:
`<VERCEL_PROJECT_NAME>`

Public URL:
`<VERCEL_PUBLIC_URL>`

Working commands:

```powershell
npx vercel --prod --yes --scope <VERCEL_SCOPE> --token <VERCEL_TOKEN>
npx vercel inspect <DEPLOYMENT_URL> --scope <VERCEL_SCOPE> --token <VERCEL_TOKEN>
```
