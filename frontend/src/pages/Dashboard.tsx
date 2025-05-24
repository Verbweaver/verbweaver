export default function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-card p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-2">Recent Projects</h3>
          <p className="text-muted-foreground">Your recently accessed projects will appear here.</p>
        </div>
        <div className="bg-card p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
          <p className="text-muted-foreground">Create new projects or import existing ones.</p>
        </div>
        <div className="bg-card p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-2">Statistics</h3>
          <p className="text-muted-foreground">View your writing statistics and progress.</p>
        </div>
      </div>
    </div>
  );
} 