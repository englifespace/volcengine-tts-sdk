const port = 8000;

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Root redirect to examples
    if (path === "/") {
      return Response.redirect("/examples/", 302);
    }

    // Default file for directory
    if (path.endsWith("/")) {
      path += "index.html";
    }

    // Try to serve the file
    // Remove leading slash to make it relative to current working directory
    const filePath = path.substring(1);
    const f = Bun.file(filePath);
    
    return new Response(f);
  },
});

console.log(`Client server running at http://localhost:${port}/examples/`);

