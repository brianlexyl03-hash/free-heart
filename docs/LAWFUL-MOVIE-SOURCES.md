# Lawful movie sources

Free Heart treats these providers as **catalogue and playback sources**, not as proof that every item is reusable. Adapters expose a source canonical URL, direct HTTPS media only, conservative quality metadata, and an explicit `rightsStatus`. A result marked `review-required` is not a license grant.

## Source policy

### Wikimedia Commons

Commons accepts freely licensed or public-domain media, but the applicable license must be stated on the individual file description page and the author/source information must be sufficient for verification. Reusers remain responsible for non-copyright restrictions and for following the license. [1]

The adapter therefore requires a per-file video MIME type and a license signal such as public domain, Creative Commons, CC BY, or CC0. It keeps the file description URL as `canonicalUrl`, uses the file's license URL as `rightsUrl` when available, and carries author/attribution metadata when published. Quality is reported only when the API provides dimensions; otherwise it remains `unknown`.

### Library of Congress National Screening Room

The Library says most motion pictures in the collection have no known U.S. copyright or other restrictions, but some copyrighted works are available by permission for limited educational use. It also warns that privacy, publicity, licensing, trademark, foreign-copyright, donation, and item-specific restrictions may apply. Rights assessment remains the reuser's responsibility, and the item record should be consulted. [2]

Free Heart consequently labels LOC items `review-required`, preserves the item URL as the canonical attribution target, and accepts only documented HTTPS MP4/MOV/WebM or HLS resources from the item record. HLS is preferred when an item publishes both HLS and a file; a missing or undocumented playable resource is unavailable rather than guessed.

### NASA Image and Video Library

NASA states that its insignia, logotype, identifiers, and imagery are not all public domain. NASA media are generally not subject to U.S. copyright for educational or informational uses, but third-party copyrighted material can appear and NASA's permission does not transfer those third-party rights. NASA should be acknowledged, and commercial use must not imply NASA endorsement; logos, employees, identifiable people, and promotional uses can require additional clearance. [3]

The adapter exposes the NASA details URL, records available MP4 rendition names, and labels every item `review-required`. An `original` rendition is reported only when the asset endpoint actually publishes an `~orig.mp4`; otherwise quality stays conservative. Do not treat the NASA source itself as a blanket commercial license.

### Blender Open Movies

Blender Studio's terms state that, unless notified otherwise, its digital content is available under Creative Commons Attribution 4.0, while Blender trademarks and logos remain protected. Project-specific notices and third-party content still matter. [4]

Free Heart keeps project/file license wording and attribution requirements with the result. The Blender adapter resolves only a current signed HTTPS MP4 published by the official asset endpoint; signed URLs are transient and must not be cached as permanent canonical links. The canonical attribution target is the project/film page, not the signed media URL. Preserve the film credit scroll and verify the project notice before redistribution.

### Internet Archive

Internet Archive warns that it does not guarantee the copyright status of items or the accuracy of item-page rights information. Uploaders may provide rights text or select a Creative Commons license, but users must verify the item and comply with applicable law. [5]

Free Heart therefore adds `review-required`, item-level rights text when present, a details-page `canonicalUrl`/`rightsUrl`, uploader attribution when published, `source-hosted` availability, and conservative `quality: { label: "unknown" }` to catalogue cards. Direct resolution selects public, non-torrent video files and ranks explicit filename resolutions without inferring a license from file format, hosting, or downloadability.

## Shared states and quality limits

- `rightsStatus: review-required` means the source has a rights policy or item metadata that must be checked before redistribution. It does not mean public domain, CC BY, or commercial permission.
- `availability: source-hosted` means Free Heart links to media hosted by the named provider. It does not guarantee uptime, continued publication, or that the item remains legally available.
- `canonicalUrl` is the provider's human-readable item/project page. Attribution should link there and preserve the provider's author, creator, license, and credit-scroll requirements.
- Quality is a lower-bound report from provider dimensions or an explicit rendition name. `unknown` is intentional; the adapter does not upscale, infer a resolution from a poster, or promise a stream variant the provider did not publish.
- Failed providers are isolated from search aggregation. A timeout, rate limit, malformed response, missing rights signal, or missing direct media resource removes that provider's result rather than substituting a guessed URL.

## Commercial licensing path

The open-source adapters are not a substitute for commercial licensing. For a commercial release, first obtain item-level permission or a license that covers the intended territory, term, media, edits, distribution channel, and promotional use. Keep the written grant and attribution instructions with the release record. For NASA material involving logos, employees, identifiable people, merchandise, or endorsement-sensitive promotion, use NASA's brand and merchandise approval guidance. For a copyrighted LOC item, contact the rights holder named in the record; LOC permission to host or screen an item is not automatically a distribution license. For Blender, follow the applicable project license and clear third-party assets and trademarks. For Internet Archive uploads, verify the uploader's rights and the selected license directly on the item page; hosting alone is not evidence of permission. When no clear license or rights holder can be verified, do not redistribute the media.

## Implementation boundary

The lawful lane must not scrape paywalls, bypass DRM, use account cookies, treat commercial catalogues as public streaming APIs, or convert a provider's preview/embed into a downloadable source. The source adapters return provider metadata and direct public HTTPS resources only; playback failure should surface as unavailable and should not trigger an unauthorized fallback.

## References

[1]: https://commons.wikimedia.org/wiki/Commons:Licensing "Wikimedia Commons Licensing policy"
[2]: https://www.loc.gov/collections/national-screening-room/about-this-collection/rights-and-access/ "Library of Congress National Screening Room Rights and Access"
[3]: https://www.nasa.gov/nasa-brand-center/images-and-media/ "NASA Images and Media Usage Guidelines"
[4]: https://studio.blender.org/terms-and-conditions/ "Blender Studio Terms and Conditions"
[5]: https://help.archive.org/help/rights/ "Internet Archive Rights guidance"
