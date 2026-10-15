<?php
/**
 * Shared page shell used by the Blixis theme and canvas document.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Canvas;

\defined( 'ABSPATH' ) || exit;

/** Defines the builder document's theme wrapper contract. */
final class PageShell {
	/** Register the theme integration filter. */
	public static function hooks(): void {
		\add_filter( 'blixis_builder_page_shell', [ self::class, 'filter' ], 10, 2 );
	}

	/**
	 * Supply Blixis theme wrapper markup and body classes when the theme is active.
	 *
	 * @param mixed    $shell Existing theme fallback descriptor.
	 * @param \WP_Post $post Current document post.
	 * @return array{open: string, close: string, body_classes: list<string>}
	 */
	public static function filter( mixed $shell, \WP_Post $post ): array {
		if ( 'blixis' !== \get_template() && 'blixis' !== \get_stylesheet() ) {
			return self::fallback( $post );
		}
		$base = self::normalize( $shell, $post );
		$type = \sanitize_html_class( $post->post_type );
		$id   = (int) $post->ID;
		$kind = 'page' === $type ? 'page' : 'single';
		return [
			'open'         => $base['open'],
			'close'        => $base['close'],
			'body_classes' => [ 'wp-singular', 'page' === $kind ? 'page-template-default' : 'single-post', 'page' === $kind ? 'page' : 'single', 'page' === $kind ? 'page-id-' . $id : 'postid-' . $id, 'wp-embed-responsive', 'wp-theme-' . \sanitize_html_class( \get_stylesheet() ) ],
		];
	}

	/**
	 * Validate a theme filter result and normalize its body class list.
	 *
	 * @param mixed    $shell Candidate descriptor.
	 * @param \WP_Post $post Current document post.
	 * @return array{open: string, close: string, body_classes: list<string>}
	 */
	private static function normalize( mixed $shell, \WP_Post $post ): array {
		$fallback = self::fallback( $post );
		if ( ! \is_array( $shell ) || ! isset( $shell['open'], $shell['close'], $shell['body_classes'] ) || ! \is_string( $shell['open'] ) || ! \is_string( $shell['close'] ) || ! \is_array( $shell['body_classes'] ) ) {
			return $fallback;
		}
		$classes = [];
		foreach ( $shell['body_classes'] as $class ) {
			if ( \is_string( $class ) && '' !== \sanitize_html_class( $class ) ) {
				$classes[] = \sanitize_html_class( $class );
			}
		}
		return [
			'open'         => $shell['open'],
			'close'        => $shell['close'],
			'body_classes' => \array_values( \array_unique( $classes ) ),
		];
	}

	/**
	 * Generic safe fallback for themes without the Blixis shell integration.
	 *
	 * @param \WP_Post $post Current document post.
	 * @return array{open: string, close: string, body_classes: list<string>}
	 */
	public static function fallback( \WP_Post $post ): array {
		$id   = (int) $post->ID;
		$type = \sanitize_html_class( $post->post_type );
		return [
			'open'         => '<main id="blx-document-main"><article id="post-' . $id . '" class="post-' . $id . ' ' . $type . ' type-' . $type . ' status-' . \sanitize_html_class( $post->post_status ) . '">',
			'close'        => '</article></main>',
			'body_classes' => [ 'wp-singular', 'page' === $type ? 'page-template-default' : 'single-post', 'page' === $type ? 'page' : 'single', 'page' === $type ? 'page-id-' . $id : 'postid-' . $id, 'wp-embed-responsive', 'wp-theme-' . \sanitize_html_class( \get_stylesheet() ) ],
		];
	}

	/**
	 * Resolve the wrapper descriptor through the theme's public filter.
	 *
	 * @param \WP_Post $post Current document post.
	 * @return array{open: string, close: string, body_classes: list<string>}
	 */
	public static function for_post( \WP_Post $post ): array {
		if ( \class_exists( \Blixis\Theme\Setup::class ) ) {
			return \Blixis\Theme\Setup::page_shell( $post );
		}
		return self::fallback( $post );
	}

	/**
	 * Wrap rendered content in the shared frontend document element.
	 *
	 * @param string $content Rendered document fragment.
	 * @return string
	 */
	public static function document_wrapper( string $content ): string {
		return '<div class="blx-page" data-blx-document>' . $content . '</div>';
	}

	/**
	 * Render a complete shell around content.
	 *
	 * @param \WP_Post $post Current document post.
	 * @param string   $content Document content.
	 * @return string
	 */
	public static function wrap( \WP_Post $post, string $content ): string {
		$shell = self::for_post( $post );
		return $shell['open'] . $content . $shell['close'];
	}
}
