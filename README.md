# Uniswap V3 Swap Prices

Recently, I was building some toy trading bots on Uniswap V3. At some point, I just wanted a simple swap price chart in my application — React, Next.js, TypeScript. Sounds easy, right? Not quite. Doing it for free turned out to be a lot trickier than expected.

Suppose you have a free Alchemy node. Even after navigating the quirks of WebSockets in development mode and figuring out the Uniswap V3 price conversion, you quickly run into a major limitation: the Alchemy free tier only allows historical queries over a very small block range — just 10 blocks per request. Want 10 minutes of data? That would require thousands of tiny requests.

The solution? The Graph API. But even there, it’s no longer completely free: you need an API key. Fortunately, the free tier gives 100,000 requests per month, which is plenty for this kind of project.

Eventually, I got the price chart working. But this little adventure is a perfect illustration of software development: what you think will take an hour can easily turn into days of figuring out APIs, rate limits, and quirks. The good news? The first time is always the hardest.