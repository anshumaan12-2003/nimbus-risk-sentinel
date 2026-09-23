import { useState } from 'react'
import { Download, MoreHorizontal, Pencil, Play, Search, Trash2 } from 'lucide-react'
import {
  Page, PageHeader, Section, Card, CardHeader, CardBody, CardFooter, Button, Badge, SeverityBadge, StatusBadge,
  Input, Textarea, Field, Kbd, Dialog, DialogTrigger, DialogContent, DialogClose, Sheet, SheetTrigger, SheetContent,
  Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel, MenuSeparator, Tooltip, Tabs, TabsList, TabsTrigger, TabsContent,
  Switch, SkeletonRows, Skeleton, EmptyState, ErrorState, ResourceId, CodeBlock, DescriptionList, StatTile,
} from '@/components/ds'
import { useSentinelStore } from '@/store/sentinelStore'

/* Internal reference: every design-system component, in the current theme. Route: /ui */
export default function UiKit() {
  const { themePref, setTheme } = useSentinelStore()
  const [loading, setLoading] = useState(false)
  return (
    <Page>
      <PageHeader
        title="Design system"
        description="Every Nimbus component in one place. Switch themes to check both."
        actions={
          <Tabs value={themePref} onValueChange={setTheme}>
            <TabsList segmented>
              <TabsTrigger value="system">System</TabsTrigger>
              <TabsTrigger value="light">Light</TabsTrigger>
              <TabsTrigger value="dark">Dark</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="grid gap-10">
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary"><Play /> Start scan</Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger"><Trash2 /> Delete</Button>
            <Button variant="link">Link action</Button>
            <Button size="sm">Small</Button>
            <Button size="lg" variant="primary">Large</Button>
            <Tooltip content="More actions"><Button size="icon" variant="ghost" aria-label="More"><MoreHorizontal /></Button></Tooltip>
            <Button loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500) }}>
              {loading ? 'Saving…' : 'Click to load'}
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-2">
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(s => <SeverityBadge key={s} severity={s} />)}
            <span className="mx-2 h-5 w-px bg-line" />
            {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'PENDING', 'REJECTED'].map(s => <StatusBadge key={s} status={s} />)}
            <Badge tone="accent">New</Badge>
            <Badge size="sm">ap-southeast-2</Badge>
          </div>
        </Section>

        <Section title="Stat tiles">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Critical" value={1} tone="critical" delta={0} hint="vs last scan" onClick={() => {}} />
            <StatTile label="High" value={4} tone="high" delta={-2} hint="vs last scan" />
            <StatTile label="Medium" value={7} tone="medium" delta={3} hint="vs last scan" />
            <StatTile label="Risk score" value={23} tone="accent" delta={-9} hint="lower is better" />
          </div>
        </Section>

        <Section title="Forms">
          <Card>
            <CardBody className="grid gap-4 pt-5 sm:grid-cols-2">
              <Field label="Email" hint="The address your admin invited.">
                {(p) => <Input {...p} type="email" placeholder="you@example.com" />}
              </Field>
              <Field label="Account ID" error="Must be 12 digits.">
                {(p) => <Input {...p} defaultValue="7919736" />}
              </Field>
              <Field label="Search">{(p) => <Input {...p} icon={Search} placeholder="Find a finding, asset or rule" />}</Field>
              <Field label="Reason for change">{(p) => <Textarea {...p} placeholder="Why is this fix needed?" />}</Field>
              <label className="flex items-center gap-3 text-sm text-fg"><Switch defaultChecked /> Scheduled scans</label>
              <p className="flex items-center gap-1.5 text-sm text-fg-2">Open command palette <Kbd>⌘</Kbd><Kbd>K</Kbd></p>
            </CardBody>
          </Card>
        </Section>

        <Section title="Card, data and code">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Root account has no MFA" description="IAM-001 · global" actions={<SeverityBadge severity="CRITICAL" />} />
              <CardBody>
                <DescriptionList items={[
                  ['Resource', <ResourceId value="arn:aws:iam::791973677674:root" />],
                  ['Service', 'IAM'],
                  ['First seen', '23 Sep 2026, 23:20'],
                  ['Status', <StatusBadge status="OPEN" />],
                ]} />
              </CardBody>
              <CardFooter><Button variant="primary" size="sm">Request fix</Button><Button size="sm" variant="ghost">Accept risk</Button></CardFooter>
            </Card>
            <CodeBlock language="aws cli" code={'aws iam create-virtual-mfa-device \\\n  --virtual-mfa-device-name root-mfa \\\n  --outfile qr.png --bootstrap-method QRCodePNG'} />
          </div>
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="fix" count={3}>Fix</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="pt-3 text-sm text-fg-2">Underline tabs for page sections.</TabsContent>
            <TabsContent value="fix" className="pt-3 text-sm text-fg-2">Three ways to fix it.</TabsContent>
            <TabsContent value="history" className="pt-3 text-sm text-fg-2">Seen in 4 scans.</TabsContent>
          </Tabs>
        </Section>

        <Section title="Overlays">
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
              <DialogContent
                title="Approve and apply this fix?"
                description="Nimbus will change your AWS account, verify the result and keep a rollback."
                footer={<><DialogClose asChild><Button>Cancel</Button></DialogClose><Button variant="primary">Approve and apply</Button></>}
              >
                <p className="text-sm text-fg-2">Requested by engineer@nimbus.local · “Close SSH to the internet.”</p>
              </DialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger asChild><Button>Open sheet</Button></SheetTrigger>
              <SheetContent title="Root account has no MFA" description="IAM-001 · global">
                <div className="p-5 text-sm text-fg-2">Detail views slide in from the right so the list stays in view.</div>
              </SheetContent>
            </Sheet>
            <Menu>
              <MenuTrigger asChild><Button>Open menu</Button></MenuTrigger>
              <MenuContent>
                <MenuLabel>Finding</MenuLabel>
                <MenuItem icon={Pencil} shortcut="E">Assign</MenuItem>
                <MenuItem icon={Download}>Export</MenuItem>
                <MenuSeparator />
                <MenuItem icon={Trash2} danger>Accept risk</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </Section>

        <Section title="States">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card><CardBody className="pt-5"><SkeletonRows rows={4} /><Skeleton className="mt-4 h-24" /></CardBody></Card>
            <Card><EmptyState mood="happy" title="No open findings" body="Everything Nimbus checks is passing." compact /></Card>
            <Card><ErrorState error={{ message: 'Network Error' }} onRetry={() => {}} compact /></Card>
          </div>
        </Section>
      </div>
    </Page>
  )
}
