import os, sys, subprocess
HERE=os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE,"ref.py")).read().split("only=int(")[0],globals())
_hd=hd; _ti=title
def hd(c,x,y,n,t,w=420,size=32): return _hd(c,x,y,n,t.replace("Before vs After","At a glance"),w,size)
def title(c,t,*a,**k): return _ti(c,t.replace("Before vs After","At a Glance"),*a,**k)
O2=os.path.join(HERE,"ref2"); V2=os.path.join(HERE,"reels2"); os.makedirs(O2,exist_ok=True); os.makedirs(V2,exist_ok=True)
POSTS2=[
P("free-heart","Part 11 : The 30-Second Story","The 30-Second Story","Discover,Watch,Save,Clip,Share","Six steps from discovery to a shareable short.",
 "Discover movies series and matchday fixtures;Watch with subtitles and quality switching;Save authorized files for private offline play;Clip caption and share in one flow",
 "Step,What happens,Where|Discover,Browse titles + fixtures,Home;Watch,Subtitles + quality,Player;Clip,Trim 1-60 sec,Clip Studio;Share,Native share or download,Share sheet|90,190,150",
 "Discover in one place;Resilient playback;Offline for authorized files;Clip Studio built in;AI captions;Official publishing paths","Discover|Watch|Clip|Share|Repeat !",
 "globe/Discover/Movies series fixtures;play/Watch/Subtitles + quality;down/Save/Authorized files offline;cut/Clip/1-60 sec in Clip Studio;sparkle/Caption/Your preferred AI;share/Share/Native share or download",
 "person/Fan opens free-heart;globe/Finds a matchday fixture;play/Watches in the player;cut/Clips a 20 sec moment;share/Shares from the device",
 "Install it from your browser menu;Clip 15-30 sec moments;Edit the title + hashtags;Review before you share;Only clip media you may republish","gear",
 "One PWA, six steps.;Mobile-first and installable.;Clip Studio is built in.;AI captions are optional.;Share with a human review.","Watch it. Save it. Shape the moment !","Which step do you use most?"),
P("Resilient Playback","Part 12 : Playback That Keeps Going","Resilient Playback","Open,Play,Rotate,Subtitle,Enjoy","When one source expires, the next one takes over.",
 "Keeps all permitted resolver mirrors;Rotates after expired or refused sources;Handles range-incompatible sources;Subtitles and quality switching in the player",
 "Problem,Normal player,free-heart|Expired link,Stops,Tries next mirror;Refused source,Error,Rotates;Weak signal,Buffering,Quality switch;Language,Hunt files,Subtitles|110,150,170",
 "Mirror rotation;Subtitles;Quality switching;Same-origin streaming;Mobile-first player;Installable PWA","Open|Play|Rotate|Enjoy|Repeat !",
 "globe/Open/Pick a title;play/Play/Start the stream;gear/Rotate/Next permitted mirror;film/Subtitles/Turn them on;bulb/Quality/Match your signal;heart/Enjoy/Keep watching",
 "person/Fan starts a stream;play/Source expires mid-play;gear/Next mirror takes over;film/Subtitles stay on;heart/Keeps watching",
 "Lower quality on mobile data;Turn on subtitles in noisy places;Use permitted sources only;Install for quick access;Refresh if a stream stalls","gear",
 "Playback rotates mirrors.;Expired sources do not end the show.;Subtitles + quality built in.;Designed for mobile networks.;Permitted sources only.","Keep the moment going !","Subtitles on or off?"),
P("Clip Studio","Part 13 : Clip Studio Deep Dive","Clip Studio Deep Dive","Select,Trim,Edit,Record,Share","Private, local clipping from playback or offline files.",
 "Select 1 to 60 seconds;Works on streaming or offline files;Records locally with MediaRecorder;Edit title caption and hashtags",
 "Feature,Detail|Length,1-60 seconds;Source,Stream or offline file;Recording,Browser MediaRecorder;Export,Share or download|140,300",
 "Private by default;No upload by default;Streaming or offline;Edit title + hashtags;Native share;Download a copy","Select|Trim|Edit|Share|Repeat !",
 "film/Pick/Open a title or file;cut/Select/1-60 seconds;play/Preview/Check the moment;sparkle/Caption/Title + hashtags;down/Export/Download a copy;share/Share/Native device share",
 "person/Creator opens an offline file;cut/Selects a 25 sec moment;sparkle/Drafts a caption;heart/Edits the hook;share/Shares from the phone",
 "Start on the action;Keep it 15-30 sec;Write a strong first line;Add 3-5 hashtags;Clip only media you may republish","bulb",
 "Clip Studio is local and private.;1-60 second selections.;Works with streaming + offline.;Edit title, caption, hashtags.;Respect licenses.","Clip with intention !","What would you clip first?"),
P("AI Captions","Part 14 : Bring Your Own AI","Bring Your Own AI","Choose,Connect,Draft,Edit,Post","Pick your AI. Your keys stay in your browser.",
 "OpenAI xAI/Grok OpenRouter and Gemini-compatible;Local models: Ollama and LM Studio;Your own compatible gateway;Browser keys stay in the browser",
 "Option,Type,Key|OpenAI,Cloud,If required;OpenRouter,Cloud,If required;Ollama,Local,Often none;LM Studio,Local,Often none|130,110,160",
 "Provider presets;Local model support;Keys stay in browser;Owner defaults optional;Edit every caption;Hashtag ideas","Choose|Connect|Draft|Edit|Repeat !",
 "gear/Choose/A provider preset;bulb/Model/Enter model if needed;heart/Key/Only when required;sparkle/Draft/Caption + hashtags;film/Edit/Make it yours;share/Post/Share your way",
 "person/Creator picks Ollama;gear/Connects a local model;sparkle/Drafts a caption;heart/Edits the tone;share/Posts it",
 "Start with a local model;Keep keys out of screenshots;Ask for 3 hook options;Keep captions short;Always review before posting","sparkle",
 "Many AI providers supported.;Local models work too.;Keys stay in your browser.;AI drafts, you decide.;Owner defaults are optional.","Your AI, your rules !","Cloud AI or local model?"),
P("Match Center","Part 15 : Live Match Center","Live Match Center","Browse,Filter,Open,Follow,Share","Fixtures, scores and match sheets in one page.",
 "Fixtures grouped by league;Live Upcoming Finished and Followed filters;Local timezone day navigation;Match sheets with score events and venue",
 "Filter,Shows,Use it for|Live,Matches in play,Right now;Upcoming,Next kickoffs,Planning;Finished,Final scores,Catch up;Followed,Your teams,Your list|100,170,160",
 "Cached scores;Fixtures by league;Match sheets;Venue + countdown;Broadcaster listings;In-page alerts","Browse|Filter|Follow|Share|Repeat !",
 "globe/Open/The live page;ball/Browse/Fixtures by league;gear/Filter/Live upcoming followed;film/Sheet/Score events venue;heart/Follow/Pick your teams;bell/Alert/In-page alerts",
 "person/Fan opens the live page;ball/Browses fixtures;film/Opens a match sheet;heart/Follows the team;bell/Gets alerts",
 "Use the Followed filter;Check local kickoff times;Open match sheets before kickoff;Follow 2-3 teams;Check broadcaster listings","ball",
 "Fixtures, scores, match sheets.;Filters keep it simple.;Local timezone built in.;Cached fallback if slow.;Broadcaster info only.","Matchday, organized !","Which league do you follow?"),
P("Alerts","Part 16 : Follow and Alerts","Follow + Alerts","Follow,Allow,Wait,Tap,Watch","In-page alerts, plus optional closed-app Web Push.",
 "Follow the teams you care about;In-page alerts while the app is open;Optional Web Push when the app is closed;Owner enables push with VAPID keys",
 "Type,When,Needs|In-page,App open,Nothing extra;Web Push,App closed,VAPID keys;Targeted,Followed teams,Follow first;Fallback,Score API slow,Cached data|110,130,150",
 "Follow teams;In-page alerts;Optional Web Push;Targeted alerts;Cached fallback;Installable PWA","Follow|Allow|Alert|Tap|Repeat !",
 "heart/Follow/Pick your teams;bell/Allow/Notifications;phone/Install/Add to home screen;bell/Wait/Alerts arrive;ball/Tap/Open the match;share/Share/Tell friends",
 "person/Fan follows two teams;bell/Allows notifications;phone/Installs the app;bell/Alert arrives;ball/Opens the match sheet",
 "Follow before matchday;Install the PWA first;Allow notifications once;Keep alerts for teams you love;Check settings if alerts stop","bell",
 "Alerts target followed teams.;In-page alerts work when open.;Closed-app push is optional.;Owner configures VAPID.;Installable PWA helps.","Never miss the moment !","Which alerts matter most?"),
P("Safe Publishing","Part 17 : Publish the Safe Way","Publish the Safe Way","Review,Connect,Choose,Publish,Repeat","Official APIs, human review, no scrape-and-blast.",
 "Postiz handoff built in;Documented n8n workflows;Official platform APIs and OAuth;Human review before publishing",
 "Do,Do not|Official APIs,Unofficial scraping;Review captions,Blind blasting;Respect rate limits,Ignore limits;Licensed media,Unlicensed media|210,210",
 "Postiz handoff;n8n patterns;OAuth connections;Rate limits respected;Human review;Platform rules first","Review|Connect|Choose|Publish|Repeat !",
 "sparkle/Draft/Caption + hashtags;film/Review/Edit and approve;gear/Connect/Postiz or n8n;heart/Choose/Pick the channel;share/Publish/Official API;bulb/Improve/Refine the next clip",
 "person/Creator drafts a clip;film/Reviews the caption;gear/Connects Postiz;share/Publishes via official API;bulb/Improves the next clip",
 "Review every caption;Use official connections;Respect rate limits;Only post media you may republish;Keep a human in the loop","gear",
 "Publishing uses official APIs.;Postiz and n8n supported.;Human review stays in the loop.;No password collecting.;Respect platform rules.","Publish with respect !","Which platform do you post on?"),
P("Offline","Part 18 : Offline-First","Offline-First","Choose,Download,Offline,Clip,Share","Authorized files, saved privately on your device.",
 "Save authorized file sources for offline play;Stored privately in your browser;Clip from an offline download;HLS streams are playable but not saved as one file",
 "Source,Offline|Authorized file,Supported;HLS stream,Playable not saved;Streaming,Playback only;Offline file,Play + clip|180,260",
 "Private storage;No upload by default;Clip from offline files;Authorized sources only;Installable PWA;Works on weak networks","Choose|Download|Go offline|Clip|Repeat !",
 "globe/Open/Pick a title;down/Download/Authorized files only;phone/Close/Leave the signal;play/Play/Watch offline;cut/Clip/From the saved file;share/Share/Native device share",
 "person/Fan saves a file on Wi-Fi;phone/Goes offline;play/Watches on the commute;cut/Clips a moment;share/Shares when online",
 "Download on Wi-Fi;Check free storage;Only save authorized files;Keep the app installed;Know that HLS is not saved as one file","down",
 "Offline saves stay private.;Authorized files only.;Clip from offline downloads.;HLS is playable, not saved whole.;Service workers may pause after force-stop.","Save once, watch anywhere !","Where do you watch offline?"),
P("Tech Stack","Part 19 : Under the Hood","Under the Hood","Web,Server,Core,Deploy,Ship","PWA front end, Fastify gateway, Rust core.",
 "web: installable PWA player Clip Studio and live center;server: Fastify gateway with rate limiting and Web Push;core: Rust sidecar adapter and resolver;automation: n8n Postiz and AI guidance",
 "Folder,Role,Tech|web,PWA front end,JavaScript;server,Gateway,Fastify;core,Media adapter,Rust;automation,Integrations,n8n + Postiz|100,170,160",
 "Installable PWA;Fastify gateway;Rate limiting;Rust sidecar;Docker image;Render blueprint","Web|Server|Core|Deploy|Repeat !",
 "phone/web/PWA + player;gear/server/Fastify gateway;film/core/Rust adapter;bulb/automation/n8n + Postiz;globe/Docker/Multi-stage image;share/Render/Blueprint deploy",
 "person/Dev clones the repo;gear/Starts the gateway;film/Runs the Rust core;phone/Opens the PWA;share/Deploys on Render",
 "Use Node.js 20+;Use Rust 1.90+;Read PROVENANCE.md;Run the server checks;Set PUBLIC_SITE_URL","gear",
 "PWA + Fastify + Rust.;Docker and Render ready.;Attribution is documented.;Verification is in TEST_REPORT.;Built for the moment.","Built in the open !","Want a code walkthrough?"),
P("Deploy","Part 20 : Deploy Your Own","Deploy in 6 Steps","Fork,Blueprint,Set,Verify,Launch","Fork it, Render reads the blueprint, you set one URL.",
 "Fork or clone the repository;Create a Render Blueprint from it;Set PUBLIC_SITE_URL to your HTTPS URL;Verify health robots sitemap and live page",
 "Variable,Purpose|PUBLIC_SITE_URL,Canonical + sitemap URLs;VAPID keys,Optional Web Push;AI_* variables,Optional AI captions;ADMIN_PASSWORD,Owner controls|230,230",
 "Dockerfile included;Render blueprint;PORT set by Render;Gateway binds 0.0.0.0;Rust core stays private;Search-ready sitemap","Fork|Blueprint|Set|Verify|Repeat !",
 "share/Fork/Or clone the repo;gear/Blueprint/Render reads render.yaml;globe/Build/Rust core + Node gateway;bulb/Set/PUBLIC_SITE_URL;film/Verify/Health robots sitemap;heart/Launch/Open the live page",
 "person/Owner forks the repo;gear/Creates a Blueprint;globe/Render builds it;bulb/Sets the site URL;heart/Checks the live page",
 "Use your real HTTPS URL;Keep secrets in Render settings;Add VAPID keys if you want push;Submit the sitemap to Search Console;Rankings are never guaranteed","gear",
 "Dockerfile + Render Blueprint included.;Set PUBLIC_SITE_URL.;Verify the health route.;Optional push and AI defaults.;Submit your sitemap.","Fork it. Deploy it. Own it !","Want a deploy walkthrough?"),
]
def vid(pi):
    ins=[];fc=[]
    for k in range(1,7): ins+=["-i",os.path.join(O2,"p%02d_%d.png"%(pi,k))]
    for k in range(6): fc.append("[%d:v]scale=1620:2025,zoompan=z='min(zoom+0.0007,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=135:s=1080x1350:fps=30,pad=1080:1920:0:285:color=0xFBFAF6,setsar=1,format=yuv420p[v%d]"%(k,k))
    last="v0"
    for k in range(1,6):
        fc.append("[%s][v%d]xfade=transition=fade:duration=0.5:offset=%.1f[x%d]"%(last,k,4.0*k,k)); last="x%d"%k
    out=os.path.join(V2,"r%02d.mp4"%pi)
    r=subprocess.run(["ffmpeg","-y","-loglevel","error"]+ins+["-filter_complex",";".join(fc),"-map","["+last+"]","-r","30","-c:v","libx264","-preset","veryfast","-crf","26","-pix_fmt","yuv420p","-movflags","+faststart","-an",out])
    print("video",pi,"ok" if r.returncode==0 else "FAILED")
only=int(sys.argv[1]) if len(sys.argv)>1 else 0
for pi,D in enumerate(POSTS2,1):
    if only and pi!=only: continue
    for si,fn in enumerate([s_cover,s_dense,s_steps,s_compare,s_example,s_cta],1):
        fn(D).im.resize((W,H),Image.LANCZOS).save(os.path.join(O2,"p%02d_%d.png"%(pi,si)))
    vid(pi)
print("done")
