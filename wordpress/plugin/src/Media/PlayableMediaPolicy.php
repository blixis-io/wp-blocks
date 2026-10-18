<?php
/** MIME policy for browser-playable media.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Media;

\defined( 'ABSPATH' ) || exit;

/** Keeps video and audio resolution to a small, explicit WordPress MIME allowlist. */
final class PlayableMediaPolicy {
	private const MIME_TYPES = [
		'audio' => [ 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/webm' ],
		'video' => [ 'video/mp4', 'video/webm', 'video/ogg' ],
	];

	/** Whether a MIME type is approved for the requested native media element.
	 *
	 * @param string $kind Media kind.
	 * @param string $mime Attachment MIME type.
	 */
	public static function allows( string $kind, string $mime ): bool {
		return isset( self::MIME_TYPES[ $kind ] ) && in_array( $mime, self::MIME_TYPES[ $kind ], true );
	}
}
