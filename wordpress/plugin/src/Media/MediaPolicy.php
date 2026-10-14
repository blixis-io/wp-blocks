<?php
/**
 * What the builder accepts as an image.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Media;

use Blixis\Builder\Registry\SafeUrl;

\defined( 'ABSPATH' ) || exit;

/**
 * Pure rules for media the builder renders (THREAT-MODEL T11): library images with a raster MIME type only, no SVG (it can
 * carry scripts), and `srcset`/`sizes` values rebuilt from validated parts instead of being passed through.
 */
final class MediaPolicy {
	public const MIME_TYPES      = [ 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif' ];
	private const MAX_CANDIDATES = 16;

	/**
	 * Whether a MIME type is an allowed image.
	 *
	 * @param string $mime MIME type of the attachment.
	 * @return bool
	 */
	public static function allows_mime( string $mime ): bool {
		return \in_array( $mime, self::MIME_TYPES, true );
	}

	/**
	 * Validate a `srcset` value and return it rebuilt, or null when any candidate is unsafe.
	 *
	 * @param string $srcset Value from WordPress, `url 300w, url 600w`.
	 * @return ?string
	 */
	public static function srcset( string $srcset ): ?string {
		if ( '' === $srcset || \strlen( $srcset ) > 4096 ) {
			return null;
		}
		$parts = [];
		foreach ( \explode( ',', $srcset ) as $candidate ) {
			$fields = \preg_split( '/\s+/', \trim( $candidate ) );
			if ( ! \is_array( $fields ) || 2 !== \count( $fields ) || 1 !== \preg_match( '/^[1-9][0-9]{0,4}w$/D', $fields[1] ) || ! SafeUrl::accepts( $fields[0] ) || 1 === \preg_match( '/[,\s"\'<>]/', $fields[0] ) ) {
				return null;
			}
			$parts[] = $fields[0] . ' ' . $fields[1];
		}
		return \count( $parts ) > self::MAX_CANDIDATES ? null : \implode( ', ', $parts );
	}

	/**
	 * Validate a `sizes` value.
	 *
	 * @param string $sizes Value from WordPress, such as `(max-width: 600px) 100vw, 600px`.
	 * @return ?string
	 */
	public static function sizes( string $sizes ): ?string {
		return '' !== $sizes && \strlen( $sizes ) <= 200 && 1 === \preg_match( '/^[A-Za-z0-9 ().,:%-]+$/D', $sizes ) ? $sizes : null;
	}

	/**
	 * Shape an attachment for the editor's picker and canvas.
	 *
	 * @param int                  $id Attachment ID.
	 * @param array<string, mixed> $media Resolved media.
	 * @return array{id: int, url: string, width: int, height: int, alt: string, srcset: ?string, sizes: ?string}
	 */
	public static function describe( int $id, array $media ): array {
		return [
			'id'     => $id,
			'url'    => (string) ( $media['url'] ?? '' ),
			'width'  => (int) ( $media['width'] ?? 0 ),
			'height' => (int) ( $media['height'] ?? 0 ),
			'alt'    => (string) ( $media['alt'] ?? '' ),
			'srcset' => \is_string( $media['srcset'] ?? null ) ? self::srcset( $media['srcset'] ) : null,
			'sizes'  => \is_string( $media['sizes'] ?? null ) ? self::sizes( $media['sizes'] ) : null,
		];
	}
}
