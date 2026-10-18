import superjson from"superjson";export async function handle(){return new Response(superjson.stringify({mode:"ai"}),{headers:{"Content-Type":"application/json"}});}
