<?php
/**
 * Editor bootstrap contract.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

use Blixis\Builder\Storage\MetaKeys;

\defined( 'ABSPATH' ) || exit;

/** Creates and safely serializes editor bootstrap data. */
final class EditorBootstrap {
	/**
	 * Build the v1 bootstrap object.
	 *
	 * `editorLocale` describes the editor chrome language; `contentLocale` selects website translation data.
	 * They are intentionally independent.
	 *
	 * @param array<string, mixed> $values Values from WordPress adapters.
	 * @return array<string, mixed>
	 */
	public static function build( array $values ): array {
		$title           = \is_string( $values['postTitle'] ?? null ) ? $values['postTitle'] : '';
		$enabled_locales = \is_array( $values['enabledLocales'] ?? null ) ? \array_values( \array_filter( $values['enabledLocales'], static fn ( $locale ): bool => \is_string( $locale ) && MetaKeys::is_valid_locale( $locale ) ) ) : [];
		$content_locale  = \is_string( $values['contentLocale'] ?? null ) && MetaKeys::is_valid_locale( $values['contentLocale'] ) ? $values['contentLocale'] : 'en_US';
		$default_locale  = \is_string( $values['defaultLocale'] ?? null ) && MetaKeys::is_valid_locale( $values['defaultLocale'] ) ? $values['defaultLocale'] : 'en_US';
		$editor_locale   = \is_string( $values['editorLocale'] ?? null ) && MetaKeys::is_valid_locale( $values['editorLocale'] ) ? $values['editorLocale'] : 'en_US';
		$preview_url     = \is_string( $values['previewUrl'] ?? null ) && self::valid_preview_url( $values['previewUrl'], (string) ( $values['siteUrl'] ?? $values['adminUrl'] ?? '' ) ) ? $values['previewUrl'] : null;
		return [
			'version'               => 1,
			'restRoot'              => (string) ( $values['restRoot'] ?? '' ),
			'wpRestRoot'            => self::valid_rest_root( $values['wpRestRoot'] ?? null, (string) ( $values['adminUrl'] ?? $values['siteUrl'] ?? '' ) ) ? $values['wpRestRoot'] : '',
			'maxUploadBytes'        => \is_int( $values['maxUploadBytes'] ?? null ) && $values['maxUploadBytes'] > 0 ? $values['maxUploadBytes'] : 1,
			'canUpload'             => true === ( $values['canUpload'] ?? false ),
			'nonce'                 => (string) ( $values['nonce'] ?? '' ),
			'postId'                => (int) ( $values['postId'] ?? 0 ),
			'postTitle'             => self::title( $title ),
			'postType'              => (string) ( $values['postType'] ?? '' ),
			'contentLocale'         => $content_locale,
			'defaultLocale'         => $default_locale,
			'enabledLocales'        => $enabled_locales,
			'editorLocale'          => $editor_locale,
			'pluginVersion'         => (string) ( $values['pluginVersion'] ?? '' ),
			'themeName'             => (string) ( $values['themeName'] ?? '' ),
			'editingEnabled'        => (bool) ( $values['editingEnabled'] ?? false ),
			'seoPluginActive'       => (bool) ( $values['seoPluginActive'] ?? false ),
			'lockReason'            => \is_string( $values['lockReason'] ?? null ) ? $values['lockReason'] : null,
			'adminUrl'              => (string) ( $values['adminUrl'] ?? '' ),
			'canvasUrl'             => \is_string( $values['canvasUrl'] ?? null ) ? $values['canvasUrl'] : null,
			'viewUrl'               => \is_string( $values['viewUrl'] ?? null ) ? $values['viewUrl'] : null,
			'previewUrl'            => $preview_url,
			'cspNonce'              => (string) ( $values['cspNonce'] ?? '' ),
			'contentLocaleExplicit' => true === ( $values['contentLocaleExplicit'] ?? false ),
		];
	}

	/**
	 * Validate a core REST root as same-origin HTTP(S), without credentials or control characters.
	 *
	 * @param mixed  $root Candidate REST root.
	 * @param string $origin_url Expected site origin.
	 * @return bool
	 */
	private static function valid_rest_root( mixed $root, string $origin_url ): bool {
		if ( ! \is_string( $root ) || '' === $root || \strlen( $root ) > 2048 || 1 === \preg_match( '/[\\x00-\\x1F\\x7F\\\\]/', $root ) ) {
			return false;
		}
		$parts = \function_exists( 'wp_parse_url' ) ? \wp_parse_url( $root ) : \parse_url( $root ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url -- Standalone contract tests run without WordPress.
		return \is_array( $parts ) && isset( $parts['scheme'] ) && \in_array( \strtolower( $parts['scheme'] ), [ 'http', 'https' ], true ) && ! isset( $parts['user'] ) && ! isset( $parts['pass'] ) && self::same_origin( $root, $origin_url );
	}

	/**
	 * JSON for an application/json script element. Hex flags prevent HTML parsing of hostile data.
	 *
	 * @param array<string, mixed> $bootstrap Contract object.
	 * @return string
	 */
	public static function to_script_json( array $bootstrap ): string {
		$json = \json_encode( $bootstrap, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- JSON_HEX flags are part of this pure, testable contract.
		return \is_string( $json ) ? \str_replace( [ "\u{2028}", "\u{2029}" ], [ '\\u2028', '\\u2029' ], $json ) : '{}';
	}

	/**
	 * Compare URL origins, ignoring userinfo and normalizing scheme, host, and default ports.
	 *
	 * @param string $a First absolute URL.
	 * @param string $b Second absolute URL.
	 * @return bool
	 */
	public static function same_origin( string $a, string $b ): bool {
		$left  = \parse_url( $a ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url -- Pure origin comparison also runs without WordPress in unit tests.
		$right = \parse_url( $b ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url -- Pure origin comparison also runs without WordPress in unit tests.
		if ( ! \is_array( $left ) || ! \is_array( $right ) || ! isset( $left['scheme'], $left['host'], $right['scheme'], $right['host'] ) ) {
			return false;
		}
		$left_scheme  = \strtolower( $left['scheme'] );
		$right_scheme = \strtolower( $right['scheme'] );
		$left_port    = $left['port'] ?? ( 'https' === $left_scheme ? 443 : ( 'http' === $left_scheme ? 80 : null ) );
		$right_port   = $right['port'] ?? ( 'https' === $right_scheme ? 443 : ( 'http' === $right_scheme ? 80 : null ) );
		return $left_scheme === $right_scheme && \strtolower( $left['host'] ) === \strtolower( $right['host'] ) && $left_port === $right_port;
	}

	/**
	 * Validate the preview URL as a bounded, credential-free same-origin HTTP URL.
	 *
	 * @param string $url Candidate preview URL.
	 * @param string $origin_url Expected site origin URL.
	 */
	private static function valid_preview_url( string $url, string $origin_url ): bool {
		$parts = \parse_url( $url ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url -- Pure validation contract also runs outside WordPress.
		return \strlen( $url ) <= 2048 && \is_array( $parts ) && isset( $parts['scheme'] ) && \in_array( \strtolower( $parts['scheme'] ), [ 'http', 'https' ], true ) && ! isset( $parts['user'] ) && ! isset( $parts['pass'] ) && self::same_origin( $url, $origin_url );
	}

	/**
	 * Bound an untrusted post title for the UI.
	 *
	 * @param string $title Raw title.
	 * @return string
	 */
	private static function title( string $title ): string {
		$title = \html_entity_decode( \function_exists( 'wp_strip_all_tags' ) ? \wp_strip_all_tags( $title ) : \strip_tags( $title ), ENT_QUOTES, 'UTF-8' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.strip_tags_strip_tags -- Standalone unit tests exercise this pure contract without WordPress loaded.
		if ( false === \preg_match_all( '/./us', $title, $characters ) ) {
			return \substr( $title, 0, 200 );
		}
		return \implode( '', \array_slice( $characters[0], 0, 200 ) );
	}
}
