<?php
/** Resolver for approved WebVTT caption attachments.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

/** Resolves only WordPress attachments with the WebVTT MIME type. */
interface TextTrackResolver {
	/** Resolve a validated caption attachment URL.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array{url:string}|null Approved text track.
	 */
	public function resolve_text_track( int $attachment_id ): ?array;
}
