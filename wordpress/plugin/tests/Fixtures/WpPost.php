<?php
/**
 * Minimal WordPress post and hook shims for isolated unit tests.
 *
 * @package Blixis\Builder\Tests
 */

declare(strict_types=1);

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals, Universal.Namespaces.DisallowCurlyBraceSyntax, Universal.Namespaces.DisallowDeclarationWithoutName, Universal.Files.SeparateFunctionsFromOO -- This test-only shim mirrors global WordPress symbols.

namespace {
	if ( ! \function_exists( 'get_post' ) ) {
		/** Return the isolated page settings fixture post.
		 *
		 * @param ?int $post_id Requested ID.
		 */
		function get_post( ?int $post_id = null ): ?WP_Post {
			$post = WP_Post::$page_settings_post;
			return null !== $post && ( null === $post_id || $post->ID === $post_id ) ? $post : null;
		}
	}
	if ( ! \function_exists( 'get_post_meta' ) ) {
		/** Return fixture post meta (empty string when absent, like a single-value read).
		 *
		 * @param int    $post_id Post ID.
		 * @param string $key Meta key.
		 * @param bool   $single Single value.
		 */
		function get_post_meta( int $post_id, string $key = '', bool $single = false ): mixed {
			unset( $single );
			return $GLOBALS['blixis_test_post_meta'][ $post_id ][ $key ] ?? '';
		}
	}
	if ( ! \function_exists( 'update_post_meta' ) ) {
		/** Store fixture post meta.
		 *
		 * @param int    $post_id Post ID.
		 * @param string $key Meta key.
		 * @param mixed  $value Value.
		 */
		function update_post_meta( int $post_id, string $key, mixed $value ): bool {
			$GLOBALS['blixis_test_post_meta'][ $post_id ][ $key ] = $value;
			return true;
		}
	}
	if ( ! \function_exists( 'clean_post_cache' ) ) {
		/** No object cache in the isolated tests.
		 *
		 * @param int $post_id Post ID.
		 */
		function clean_post_cache( int $post_id ): void {
			$GLOBALS['blixis_test_cache_cleaned'][] = $post_id;
		}
	}
	if ( ! \function_exists( 'wp_json_encode' ) ) {
		/** JSON-encode like WordPress.
		 *
		 * @param mixed $value Value.
		 */
		function wp_json_encode( mixed $value ): string|false {
			return \json_encode( $value );
		}
	}
	if ( ! \function_exists( 'wp_strip_all_tags' ) ) {
		/** Strip tags for request policy unit tests.
		 *
		 * @param string $text Source text.
		 */
		function wp_strip_all_tags( string $text ): string {
			return \trim( (string) \strip_tags( $text ) );
		}
	}
	if ( ! \function_exists( 'get_option' ) ) {
		/** Return a deterministic locale configuration for page settings tests.
		 *
		 * @param string $option Option name.
		 * @param mixed  $default_value Default value.
		 */
		function get_option( string $option, mixed $default_value = false ): mixed {
			return 'blixis_locales' === $option ? [
				'version'        => 1,
				'defaultLocale'  => 'en_US',
				'enabledLocales' => [ 'en_US', 'nl_NL' ],
			] : $default_value;
		}
	}
	if ( ! \function_exists( 'get_locale' ) ) {
		/** Return the fixture interface locale. */
		function get_locale(): string {
			return 'en_US';
		}
	}
	if ( ! \function_exists( 'home_url' ) ) {
		/** Return the fixture site URL.
		 *
		 * @param string $path URL path.
		 */
		function home_url( string $path = '' ): string {
			return 'https://example.test' . $path;
		}
	}
	if ( ! \function_exists( 'wp_parse_url' ) ) {
		/** Parse URL for isolated page settings policy tests.
		 *
		 * @param string $url URL.
		 * @param int    $component Requested URL component.
		 * @return array<string, mixed>|string|int|false
		 */
		function wp_parse_url( string $url, int $component = -1 ): array|string|int|false {
			$parsed = \parse_url( $url, $component );
			return null === $parsed ? false : $parsed;
		}
	}
	if ( ! \function_exists( 'wp_update_post' ) ) {
		/** Count attempted post writes in isolated page settings tests.
		 *
		 * @param array<string, mixed> $postarr Post fields.
		 * @param bool                 $wp_error Whether to return errors.
		 */
		function wp_update_post( array $postarr, bool $wp_error = false ): int|WP_Error {
			if ( $wp_error && isset( $postarr['test_error'] ) ) {
				return new WP_Error( 'test_error', 'Test error.', [] );
			}
			++WP_Post::$page_settings_write_count;
			return (int) ( $postarr['ID'] ?? 0 );
		}
	}
	if ( ! \function_exists( 'wp_slash' ) ) {
		/** Return a value unchanged for isolated page settings tests.
		 *
		 * @param mixed $value Input.
		 */
		function wp_slash( mixed $value ): mixed {
			return $value;
		}
	}
	if ( ! \class_exists( 'WP_Post' ) ) {
		/** Minimal post value used when the WordPress test library is not loaded. */
		final class WP_Post {
			/** Current isolated settings post.
			 *
			 * @var ?self
			 */
			public static ?self $page_settings_post = null;
			/** Number of isolated settings write calls.
			 *
			 * @var int
			 */
			public static int $page_settings_write_count = 0;
			/** Post ID.
			 *
			 * @var int
			 */
			public int $ID;
			/** Post type.
			 *
			 * @var string
			 */
			public string $post_type;
			/** Post status.
			 *
			 * @var string
			 */
			public string $post_status;
			/** Post slug.
			 *
			 * @var string
			 */
			public string $post_name;
			/** Post title.
			 *
			 * @var string
			 */
			public string $post_title;
			/** Post body.
			 *
			 * @var string
			 */
			public string $post_content;
			/** Modification timestamp.
			 *
			 * @var string
			 */
			public string $post_modified_gmt;
			/** Parent post ID.
			 *
			 * @var int
			 */
			public int $post_parent;

			/** Build a minimal post fixture.
			 *
			 * @param object $post Post fields.
			 */
			public function __construct( object $post ) {
				$this->ID                = (int) ( $post->ID ?? 0 );
				$this->post_type         = (string) ( $post->post_type ?? 'page' );
				$this->post_status       = (string) ( $post->post_status ?? 'publish' );
				$this->post_name         = (string) ( $post->post_name ?? '' );
				$this->post_title        = (string) ( $post->post_title ?? '' );
				$this->post_content      = (string) ( $post->post_content ?? '' );
				$this->post_modified_gmt = (string) ( $post->post_modified_gmt ?? '' );
				$this->post_parent       = (int) ( $post->post_parent ?? 0 );
			}
		}
	}

	if ( ! \function_exists( 'sanitize_html_class' ) ) {
		/** Sanitize a class for the test fixture.
		 *
		 * @param string $candidate Candidate class.
		 * @return string
		 */
		function sanitize_html_class( string $candidate ): string {
			return (string) \preg_replace( '/[^A-Za-z0-9_-]/', '', $candidate );
		}
	}
	if ( ! \function_exists( 'get_body_class' ) ) {
		/** Return the fixture body classes.
		 *
		 * @return list<string>
		 */
		function get_body_class(): array {
			return [ 'wp-singular', 'page', 'page-id-1', 'wp-embed-responsive', 'wp-theme-blixis' ];
		}
	}
	if ( ! \function_exists( 'get_template' ) ) {
		/** Return the fixture theme template.
		 *
		 * @return string
		 */
		function get_template(): string {
			return 'blixis';
		}
	}
	if ( ! \function_exists( 'get_stylesheet' ) ) {
		/** Return the fixture theme stylesheet.
		 *
		 * @return string
		 */
		function get_stylesheet(): string {
			return 'blixis';
		}
	}
	if ( ! \function_exists( 'esc_attr' ) ) {
		/** Escape a fixture attribute.
		 *
		 * @param string $value Candidate attribute.
		 * @return string
		 */
		function esc_attr( string $value ): string {
			return \htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
		}
	}
	if ( ! \function_exists( 'esc_url' ) ) {
		/** Escape a fixture URL.
		 *
		 * @param string $value Candidate URL.
		 * @return string
		 */
		function esc_url( string $value ): string {
			return \htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
		}
	}
}
