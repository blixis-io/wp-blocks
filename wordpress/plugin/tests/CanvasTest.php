<?php
/**
 * Canvas CSS security contract.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Canvas\TokenCss;
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
		$this->assertStringContainsString( '<meta name="color-scheme" content="light">', $html );
		$this->assertStringContainsString( 'data-blx-mode="light"', $html );
		$this->assertStringContainsString( 'href="https://example.test/wp-content/themes/blixis/assets/css/theme.css"', $html ); // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- Assertion against standalone document markup.
		$this->assertSame( 3, \substr_count( $html, '<link rel="stylesheet"' ) ); // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet -- Count stylesheet links in standalone markup.
		$this->assertStringNotContainsString( 'data-editor-theme', $html );
		$this->assertSame( "default-src 'none'; script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAAAA'; style-src 'self' 'nonce-AAAAAAAAAAAAAAAAAAAAAAAA'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'", EditorHeaders::canvas_list( 'AAAAAAAAAAAAAAAAAAAAAAAA' )['Content-Security-Policy'] );
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
