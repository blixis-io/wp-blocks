<?php
/** WordPress attachment adapter.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

/** The only renderer-side WordPress boundary. */
final class WordPressMediaResolver implements MediaResolver {
	/**
	 * Apply the documented contract.
	 *
	 * @param int $attachment_id Attachment id.
	 * @return array{url:string,width:int,height:int,alt:string}|null Resolved media.
	 */
	public function resolve( int $attachment_id ): ?array {
		$image = \wp_get_attachment_image_src( $attachment_id, 'full' );
		if ( ! \is_array( $image ) || ! \is_string( $image[0] ?? null ) || ! \is_int( $image[1] ?? null ) || ! \is_int( $image[2] ?? null ) ) {
			return null;
		}
		return [
			'url'    => $image[0],
			'width'  => $image[1],
			'height' => $image[2],
			'alt'    => (string) \get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ),
		];
	}
}
