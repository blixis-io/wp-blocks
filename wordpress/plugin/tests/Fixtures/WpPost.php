<?php
/**
 * Minimal WordPress post and hook shims for isolated unit tests.
 *
 * @package Blixis\Builder\Tests
 */

declare(strict_types=1);

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals, Universal.Namespaces.DisallowCurlyBraceSyntax, Universal.Namespaces.DisallowDeclarationWithoutName, Universal.Files.SeparateFunctionsFromOO -- This test-only shim mirrors global WordPress symbols.

namespace {
	if ( ! \class_exists( 'WP_Post' ) ) {
		/** Minimal post value used when the WordPress test library is not loaded. */
		final class WP_Post {
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

			/** Build a minimal post fixture.
			 *
			 * @param object $post Post fields.
			 */
			public function __construct( object $post ) {
				$this->ID           = (int) ( $post->ID ?? 0 );
				$this->post_type    = (string) ( $post->post_type ?? 'page' );
				$this->post_status  = (string) ( $post->post_status ?? 'publish' );
				$this->post_name    = (string) ( $post->post_name ?? '' );
				$this->post_title   = (string) ( $post->post_title ?? '' );
				$this->post_content = (string) ( $post->post_content ?? '' );
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
