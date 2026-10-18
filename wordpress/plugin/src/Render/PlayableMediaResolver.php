<?php
/** Resolver for approved audio and video attachments.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

/** Resolves a WordPress attachment to a browser-playable media URL and MIME type. */
interface PlayableMediaResolver {
	/** Resolve a media attachment after applying the MIME allowlist.
	 *
	 * @param int    $attachment_id Attachment ID.
	 * @param string $kind          Either audio or video.
	 * @return array{url:string,mime:string}|null Approved playable media.
	 */
	public function resolve_playable( int $attachment_id, string $kind ): ?array;
}
