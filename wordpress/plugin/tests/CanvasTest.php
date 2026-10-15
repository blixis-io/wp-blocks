<?php
/**
 * Canvas CSS security contract.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Canvas\TokenCss;
use Blixis\Builder\Canvas\PageShell;
use Blixis\Builder\Canvas\FontFaceCss;
use Blixis\Builder\Admin\EditorAccess;
use Blixis\Builder\Admin\EditorAccessResult;
use Blixis\Builder\Admin\CanvasScreen;
use Blixis\Builder\Admin\EditorHeaders;
use Blixis\Builder\Locale\Direction;
use Blixis\Builder\Rest\FakePostAccess;
use Blixis\Builder\Theme\ThemeStatus;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
require_once __DIR__ . '/Fixtures/WpPost.php';
require_once \dirname( __DIR__, 2 ) . '/theme/src/Setup.php';
\Blixis\Builder\Autoloader::register();

/** Verifies token CSS accepts only theme-safe values. */
final class CanvasTest extends TestCase {
	/** The standalone canvas document loads only explicit theme assets and uses content locale and website mode. */
	public function test_canvas_document_markup_contract(): void {
		$links = '<link rel="stylesheet" href="https://example.test/wp-content/themes/blixis/style.css"><link rel="stylesheet" href="https://example.test/wp-content/themes/blixis/assets/css/tokens.css"><link rel="stylesheet" href="https://example.test/wp-content/themes/blixis/assets/css/theme.css">'; // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- Fixture markup for the standalone canvas document.
		$html  = CanvasScreen::document_markup(
			$links,
			TokenCss::from_option(
				[
					'color-bg' => [
						'value' => '#fff',
						'dark'  => '#000',
					],
				]
			),
			'AAAAAAAAAAAAAAAAAAAAAAAA',
			'https://example.test/plugin/canvas.js',
			'ar',
			Direction::dir( 'ar' )
		);
		$this->assertStringContainsString( '<html lang="ar" dir="rtl" data-theme="light">', $html );
		$this->assertStringContainsString( '<main id="content" class="site-main site-shell" tabindex="-1"><article id="post-1"', $html );
		$this->assertStringContainsString( '<div class="entry-content"><div class="blx-page" data-blx-document><div id="blx-canvas-root"', $html );
		$this->assertSame( '<div class="blx-page" data-blx-document>mount</div>', PageShell::document_wrapper( 'mount' ) );
		$this->assertStringContainsString( 'wp-embed-responsive', $html );
		$this->assertStringNotContainsString( 'site-header', $html );
		$this->assertStringContainsString( '<meta name="color-scheme" content="light">', $html );
		$this->assertStringContainsString( 'data-blx-mode="light"', $html );
		$this->assertStringContainsString( 'href="https://example.test/wp-content/themes/blixis/assets/css/theme.css"', $html ); // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- Assertion against standalone document markup.
		$this->assertSame( 3, \substr_count( $html, '<link rel="stylesheet"' ) ); // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- Count stylesheet links in standalone markup.
		$font_css  = '@font-face{font-family:Montserrat;font-style:normal;font-weight:400;src:url("https://example.test/wp-content/fonts/montserrat.woff2") format("woff2")}';
		$font_css  = FontFaceCss::sanitize( $font_css, 'https://example.test/' );
		$font_html = CanvasScreen::document_markup( '', '', 'AAAAAAAAAAAAAAAAAAAAAAAA', 'https://example.test/plugin/canvas.js', 'en', 'ltr', null, $font_css );
		$this->assertStringContainsString( '<style class="wp-fonts-local" nonce="AAAAAAAAAAAAAAAAAAAAAAAA">' . $font_css . '</style>', $font_html );
		$this->assertSame( '', FontFaceCss::sanitize( '@import url(https://example.test/font.css);' . $font_css, 'https://example.test/' ) );
		$this->assertSame( '', FontFaceCss::sanitize( str_replace( 'https://example.test/wp-content/fonts/', 'https://cdn.example.test/fonts/', $font_css ), 'https://example.test/' ) );
		$this->assertSame( '', FontFaceCss::sanitize( str_replace( 'https://example.test/wp-content/fonts/', 'data:font/woff2;base64,AA', $font_css ), 'https://example.test/' ) );
		$this->assertSame( '', FontFaceCss::sanitize( str_replace( 'font-family:Montserrat', 'font-family:url(https://example.test/other.woff2)', $font_css ), 'https://example.test/' ) );
		$this->assertSame( '', FontFaceCss::sanitize( '', 'https://example.test/' ) );
		$this->assertStringNotContainsString( 'data-editor-theme', $html );
		$this->assertSame( "default-src 'none'; script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAAAA'; style-src 'self' 'nonce-AAAAAAAAAAAAAAAAAAAAAAAA'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'", EditorHeaders::canvas_list( 'AAAAAAAAAAAAAAAAAAAAAAAA' )['Content-Security-Policy'] );
	}

	/** Shared shell uses numeric post identity and safe generic fallback markup. */
	public function test_page_shell_page_single_and_generic_fallback(): void {
		$page       = new \WP_Post(
			(object) [
				'ID'          => 42,
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_name'   => '" onload="alert(1)',
			]
		);
		$single     = new \WP_Post(
			(object) [
				'ID'          => 43,
				'post_type'   => 'post',
				'post_status' => 'publish',
			]
		);
		$page_shell = PageShell::filter( [], $page );
		$post_shell = PageShell::filter( [], $single );
		$this->assertStringContainsString( 'id="post-42"', $page_shell['open'] );
		$this->assertStringContainsString( 'page-id-42', \implode( ' ', $page_shell['body_classes'] ) );
		$this->assertStringContainsString( 'post-43', $post_shell['open'] );
		$this->assertStringNotContainsString( 'onload', $page_shell['open'] );
		$fallback = PageShell::fallback( $page );
		$this->assertStringContainsString( 'id="post-42"', $fallback['open'] );
		$this->assertContains( 'wp-embed-responsive', $fallback['body_classes'] );
	}

	/** Canvas access shares the screen's uniform policy; a theme lock permits read-only access. */
	public function test_canvas_access_matrix(): void {
		$posts = new FakePostAccess();
		$theme = new ThemeStatus( true, 1, 1, 1, 'Fixture Theme', 'ok' );
		$this->assertSame( EditorAccessResult::ALLOWED, EditorAccess::check( 4, $posts, $theme )->state );

		$posts->authenticated = false;
		$this->assertSame( EditorAccessResult::UNAUTHENTICATED, EditorAccess::check( 4, $posts, $theme )->state );
		$posts->authenticated = true;
		foreach ( [ 'exists', 'opted_in', 'can_edit' ] as $property ) {
			$posts->{$property} = false;
			$this->assertSame( EditorAccessResult::FORBIDDEN, EditorAccess::check( 4, $posts, $theme )->state );
			$posts->{$property} = true;
		}
		$this->assertSame( EditorAccessResult::FORBIDDEN, EditorAccess::check( 0, $posts, $theme )->state );

		$locked_theme = new ThemeStatus( false, null, 1, 1, 'Fixture Theme', 'too-new' );
		$locked       = EditorAccess::check( 4, $posts, $locked_theme );
		$this->assertSame( EditorAccessResult::THEME_LOCKED, $locked->state );
		$this->assertSame( 'too-new', $locked->lock_reason );
	}

	/** Theme selectors match output while explicit canvas modes override it. */
	public function test_emits_theme_selectors_and_canvas_modes(): void {
		$css = TokenCss::from_option(
			[
				'tokens' => [
					'color-bg' => [
						'value' => '#fff',
						'dark'  => '#000',
					],
				],
			]
		);
		$this->assertSame( '@layer blx.tokens{:where(:root){--blx-color-bg:#fff}:where(#blx-canvas-root[data-blx-mode="light"]){--blx-color-bg:#fff}:where(html[data-theme="dark"]){--blx-color-bg:#000}@media (prefers-color-scheme:dark){:where(html:not([data-theme="light"]):not([data-theme="dark"])){--blx-color-bg:#000}}:where(#blx-canvas-root[data-blx-mode="dark"]){--blx-color-bg:#000}}', $css );
	}

	/** Unsafe delimiters and malformed token names never enter generated CSS. */
	public function test_hostile_and_malformed_tokens_are_skipped(): void {
		$hostiles = [ '</style><script>x', 'url(javascript:alert(1))', 'red;}', 'red";}', "red\nbody{x:y}", 'red}body{x:y' ];
		$tokens   = [ 'good' => [ 'value' => '#fff' ] ];
		foreach ( $hostiles as $index => $hostile ) {
			$tokens[ 'bad-' . $index ] = [
				'value' => $hostile,
				'dark'  => $hostile,
			];
		}
		$tokens['invalid_name'] = [ 'value' => 'red' ];
		$css                    = TokenCss::from_option( $tokens );
		$this->assertStringContainsString( '--blx-good:#fff', $css );
		$this->assertStringNotContainsString( '</style>', $css );
		$this->assertStringNotContainsString( 'url(', $css );
		$this->assertStringNotContainsString( 'red;', $css );
		$this->assertSame( '', TokenCss::from_option( false ) );
	}
}
