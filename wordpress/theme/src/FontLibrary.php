<?php
/**
 * Safe, bounded adapter for WordPress Font Library families.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/** Reads installed font identities without owning or printing font files. */
final class FontLibrary {
	public const MAX_FAMILIES = 50;
	private const MAX_JSON    = 16384;

	/**
	 * Parse one family post's theme.json-shaped content without WordPress.
	 *
	 * @param string $json Post content.
	 * @return array{slug: string, name: string, css_family: string, faces: list<array{weight: string, style: string}>}|null
	 */
	public static function parse_family( string $json ): ?array {
		if ( \strlen( $json ) > self::MAX_JSON ) {
			return null;
		}
		$data = \json_decode( $json, true );
		if ( ! \is_array( $data ) || ! \is_string( $data['slug'] ?? null ) || 1 !== \preg_match( '/^[a-z0-9][a-z0-9-]{0,63}$/D', $data['slug'] ) || ! \is_string( $data['name'] ?? null ) || ! \is_string( $data['fontFamily'] ?? null ) ) {
			return null;
		}
		if ( ! self::safe_name( $data['name'] ) || ! self::safe_name( $data['fontFamily'] ) || ! \is_array( $data['fontFace'] ?? null ) || ! \array_is_list( $data['fontFace'] ) || \count( $data['fontFace'] ) > 100 ) {
			return null;
		}
		$faces = [];
		foreach ( $data['fontFace'] as $face ) {
			if ( ! \is_array( $face ) ) {
				return null;
			}
			$weight = $face['fontWeight'] ?? '400';
			$style  = $face['fontStyle'] ?? 'normal';
			if ( ! \is_string( $weight ) || ! \is_string( $style ) || ! self::safe_weight( $weight ) || ! \in_array( $style, [ 'normal', 'italic', 'oblique' ], true ) ) {
				return null;
			}
			$faces[ $weight . '/' . $style ] = [
				'weight' => $weight,
				'style'  => $style,
			];
		}
		return [
			'slug'       => $data['slug'],
			'name'       => $data['name'],
			'css_family' => $data['fontFamily'],
			'faces'      => \array_values( $faces ),
		];
	}

	/**
	 * Check a CSS family name or display name.
	 *
	 * @param string $name Candidate name.
	 */
	private static function safe_name( string $name ): bool {
		return 1 === \preg_match( '/^[A-Za-z0-9 _-]{1,64}$/D', $name ) && '' !== \trim( $name );
	}

	/**
	 * Check single CSS weights and variable-font ranges.
	 *
	 * @param string $weight Candidate weight.
	 */
	private static function safe_weight( string $weight ): bool {
		if ( 1 !== \preg_match( '/^([1-9]00)(?: ([1-9]00))?$/D', $weight, $match ) ) {
			return false;
		}
		return ! isset( $match[2] ) || (int) $match[1] <= (int) $match[2];
	}

	/**
	 * Build a CSS stack from a validated family and generic fallback.
	 *
	 * @param string $family Family name.
	 * @param string $fallback Generic CSS family.
	 * @return string|null Safe stack.
	 */
	public static function css_stack( string $family, string $fallback ): ?string {
		return self::safe_name( $family ) && \in_array( $fallback, [ 'sans-serif', 'serif', 'monospace' ], true ) ? '"' . $family . '", system-ui, ' . $fallback : null;
	}

	/**
	 * Deduplicate parsed families by slug and cap the result.
	 *
	 * @param array<string> $json_posts Post contents.
	 * @return list<array{slug: string, name: string, css_family: string, faces: list<array{weight: string, style: string}>}>
	 */
	public static function parse_families( array $json_posts ): array {
		$out = [];
		foreach ( $json_posts as $json ) {
			if ( ! \is_string( $json ) ) {
				continue;
			}
			$family = self::parse_family( $json );
			if ( null !== $family && ! isset( $out[ $family['slug'] ] ) ) {
				$out[ $family['slug'] ] = $family;
				if ( \count( $out ) >= self::MAX_FAMILIES ) {
					break;
				}
			}
		}
		return \array_values( $out );
	}

	/**
	 * Convert WordPress Font Library post data into the JSON accepted by parse_family().
	 *
	 * WordPress keeps the slug in post_name, the display name in post_title, a CSS stack such as
	 * `Montserrat, sans-serif` in the family content and each face in its own child post.
	 *
	 * @param string        $slug          Family post_name.
	 * @param string        $title         Family post_title.
	 * @param string        $content       Family post_content (JSON).
	 * @param array<string> $face_contents Face post_content values (JSON).
	 * @return string|null JSON for parse_family(), or null for unusable data.
	 */
	public static function from_post_data( string $slug, string $title, string $content, array $face_contents ): ?string {
		$family = \json_decode( $content, true );
		if ( ! \is_array( $family ) || ! \is_string( $family['fontFamily'] ?? null ) ) {
			return null;
		}
		$first = \trim( \explode( ',', $family['fontFamily'] )[0], " \t\n\r\0\x0B\"'" );
		$faces = [];
		foreach ( $face_contents as $face_json ) {
			$face = \is_string( $face_json ) ? \json_decode( $face_json, true ) : null;
			if ( \is_array( $face ) ) {
				$faces[] = [
					'fontWeight' => $face['fontWeight'] ?? '400',
					'fontStyle'  => $face['fontStyle'] ?? 'normal',
				];
			}
		}
		$encoded = \json_encode( // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure helper used without WordPress.
			[
				'slug'       => $slug,
				'name'       => $title,
				'fontFamily' => $first,
				'fontFace'   => $faces,
			]
		);
		return false === $encoded ? null : $encoded;
	}

	/**
	 * Return published Library families, cached for this request.
	 *
	 * @return list<array{slug: string, name: string, css_family: string, faces: list<array{weight: string, style: string}>}>
	 */
	public static function installed(): array {
		static $families = null;
		if ( null !== $families ) {
			return $families;
		}
		$posts = get_posts(
			[
				'post_type'   => 'wp_font_family',
				'post_status' => 'publish',
				'numberposts' => self::MAX_FAMILIES,
				'orderby'     => 'ID',
				'order'       => 'ASC',
			]
		);
		$json  = [];
		foreach ( $posts as $post ) {
			$faces = get_posts(
				[
					'post_type'   => 'wp_font_face',
					'post_status' => 'publish',
					'post_parent' => $post->ID,
					'numberposts' => 100,
				]
			);
			$entry = self::from_post_data( $post->post_name, $post->post_title, $post->post_content, \array_map( static fn( $face ) => $face->post_content, $faces ) );
			if ( null !== $entry ) {
				$json[] = $entry;
			}
		}
		$families = self::parse_families( $json );
		return $families;
	}

	/**
	 * Return exact server-derived stacks accepted for either typography token.
	 *
	 * @return list<string>
	 */
	public static function allowed_stacks(): array {
		$stacks = [];
		foreach ( self::installed() as $family ) {
			$stack = self::css_stack( $family['css_family'], 'sans-serif' );
			if ( null !== $stack ) {
				$stacks[] = $stack;
			}
		}
		return \array_values( \array_unique( $stacks ) );
	}
}
