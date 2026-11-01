// free❤️‍🔥 Live Match Center configuration.
// League IDs are resolved by the configured server-side score provider.
window.__FREE_LIVE_CONFIG = {
  liveRefreshMs: 20000,      // while a match is live
  idleRefreshMs: 60000,      // otherwise
  reminderMinutes: 15,
  channels: [
    { id: 'bein', name: 'beIN SPORTS', sport: 'Football and multisport', region: 'Regional availability', url: 'https://www.beinsports.com/en-us' },
    { id: 'dazn', name: 'DAZN', sport: 'Football, boxing and more', region: 'Country-specific catalogue', url: 'https://www.dazn.com/' },
    { id: 'tnt', name: 'TNT Sports', sport: 'Football and live sport', region: 'UK, Ireland and US services', url: 'https://www.tntsports.co.uk/' },
    { id: 'sky', name: 'Sky Sports', sport: 'Football, cricket and motorsport', region: 'UK, Ireland and Italy', url: 'https://www.skysports.com/watch' },
    { id: 'star', name: 'Star Sports', sport: 'Cricket and Indian sport', region: 'India and authorised partners', url: 'https://www.jiostar.com/' },
    { id: 'willow', name: 'Willow by Cricbuzz', sport: 'Live cricket', region: 'USA and Canada', url: 'https://www.willow.tv/' },
    { id: 'fox-cricket', name: 'FOX Cricket', sport: 'Australian cricket', region: 'Australia and authorised partners', url: 'https://www.foxsports.com.au/cricket-' },
  ],       // "kicks off soon" reminder for followed matches
  leagues: [
    ['eng.1', 'Premier League', 'England'],
    ['esp.1', 'LaLiga', 'Spain'],
    ['ita.1', 'Serie A', 'Italy'],
    ['ger.1', 'Bundesliga', 'Germany'],
    ['fra.1', 'Ligue 1', 'France'],
    ['uefa.champions', 'Champions League', 'Europe'],
    ['uefa.europa', 'Europa League', 'Europe'],
    ['uefa.europa.conf', 'Conference League', 'Europe'],
    ['eng.2', 'Championship', 'England'],
    ['eng.fa', 'FA Cup', 'England'],
    ['eng.league_cup', 'EFL Cup', 'England'],
    ['esp.copa_del_rey', 'Copa del Rey', 'Spain'],
    ['ned.1', 'Eredivisie', 'Netherlands'],
    ['por.1', 'Primeira Liga', 'Portugal'],
    ['bel.1', 'Belgian Pro League', 'Belgium'],
    ['tur.1', 'Süper Lig', 'Türkiye'],
    ['sco.1', 'Scottish Premiership', 'Scotland'],
    ['usa.1', 'MLS', 'USA'],
    ['mex.1', 'Liga MX', 'Mexico'],
    ['bra.1', 'Brasileirão', 'Brazil'],
    ['arg.1', 'Liga Profesional', 'Argentina'],
    ['conmebol.libertadores', 'Copa Libertadores', 'South America'],
    ['sau.1', 'Saudi Pro League', 'Saudi Arabia'],
    ['caf.nations', 'Africa Cup of Nations', 'Africa'],
    ['fifa.world', 'World Cup', 'World'],
    ['uefa.nations', 'Nations League', 'Europe']
  ]
};
