import { Link, Route, Switch, useRoute } from "wouter";
import { InboxPage } from "./routes/InboxPage.js";
import { MessageDetailPage } from "./routes/MessageDetailPage.js";
import { DevDraftPage } from "./routes/DevDraftPage.js";

export function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <TopNav />
      <Switch>
        <Route path="/" component={InboxPage} />
        <Route path="/messages/:id">
          {(params) => <MessageDetailPage id={params.id} />}
        </Route>
        <Route path="/dev" component={DevDraftPage} />
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </div>
  );
}

function TopNav() {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-gray-900">
          eBay AI Message Assistant
        </div>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <NavLink href="/" matchPath="/" label="Inbox" />
          <NavLink href="/dev" matchPath="/dev" label="Dev draft" />
          <a
            href="https://github.com/your-org/Ebay_message_AI/blob/main/README.md"
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            Help
          </a>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  matchPath,
  label,
}: {
  href: string;
  matchPath: string;
  label: string;
}) {
  const [active] = useRoute(matchPath);
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 transition-colors ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {label}
    </Link>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-center">
      <h1 className="text-lg font-semibold text-gray-900">Not found</h1>
      <p className="mt-2 text-sm text-gray-600">
        <Link href="/" className="text-blue-600 underline">
          Back to inbox
        </Link>
      </p>
    </div>
  );
}
