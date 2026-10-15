<?php
/**
 * Isolated editor policy and contract tests (BWB-049).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

	use Blixis\Builder\Admin\EditorAccess;
	use Blixis\Builder\Admin\EditorAccessResult;
	use Blixis\Builder\Admin\EditorAssets;
	use Blixis\Builder\Admin\EditorBootstrap;
	use Blixis\Builder\Admin\EditorHeaders;
	use Blixis\Builder\Admin\EditorRequest;
use Blixis\Builder\Admin\EditorScreen;
	use Blixis\Builder\Admin\EditorUrl;
	use Blixis\Builder\Locale\LocaleConfig;
	use Blixis\Builder\Rest\FakePostAccess;
	use Blixis\Builder\Theme\ThemeStatus;
	use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
	require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
	require_once __DIR__ . '/FakePostAccess.php';
	\Blixis\Builder\Autoloader::register();

	/** Exercises isolated editor pure policies. */
final class EditorScreenTest extends TestCase {
	/**
	 * Create a theme status fixture.
	 *
	 * @param bool   $compatible Compatibility.
	 * @param string $reason Reason.
	 * @return ThemeStatus
	 */
	private function theme( bool $compatible = true, string $reason = 'ok' ): ThemeStatus {
		return new ThemeStatus( $compatible, $compatible ? 1 : null, 1, 1, 'Fixture Theme', $reason );
	}

	/** URL and query parsing reject hostile values and use default locale fallback. */
	public function test_url_and_request_parsing(): void {
		$this->assertSame( 'https://example.test/wp-admin/admin.php?page=blixis-editor&post=42&locale=nl_NL', EditorUrl::build( 'https://example.test/wp-admin/admin.php', 42, 'nl_NL' ) );
		$this->assertSame( 'https://example.test/wp-admin/admin.php?page=blixis-canvas&post=42&locale=nl_NL', EditorUrl::build_canvas( 'https://example.test/wp-admin/admin.php', 42, 'nl_NL' ) );
		$locales = new LocaleConfig( 'en_US', [ 'en_US', 'nl_NL' ] );
		foreach ( [ [ 'post' => '0' ], [ 'post' => '-1' ], [ 'post' => '1e3' ], [ 'post' => '999999999999999999999999' ], [ 'post' => [ '42' ] ], [ 'post' => '<script>' ] ] as $query ) {
			$this->assertSame( 0, EditorRequest::parse( $query, $locales )->post_id );
		}
		$this->assertSame(
			42,
			EditorRequest::parse(
				[
					'post'   => '42',
					'locale' => '../../evil',
				],
				$locales
			)->post_id
		);
		$this->assertSame(
			'en_US',
			EditorRequest::parse(
				[
					'post'   => '42',
					'locale' => 'fr_FR',
				],
				$locales
			)->content_locale
		);
		$this->assertSame(
			'nl_NL',
			EditorRequest::parse(
				[
					'post'   => 42,
					'locale' => 'nl_NL',
				],
				$locales
			)->content_locale
		);
	}

	/** Every access branch has its intended state and uniform denial. */
	public function test_access_matrix(): void {
		$posts = new FakePostAccess();
		$this->assertSame( EditorAccessResult::ALLOWED, EditorAccess::check( 4, $posts, $this->theme() )->state );
		$posts->authenticated = false;
		$this->assertSame( EditorAccessResult::UNAUTHENTICATED, EditorAccess::check( 4, $posts, $this->theme() )->state );
		$posts->authenticated = true;
		foreach ( [ 'exists', 'opted_in', 'can_edit' ] as $property ) {
			$posts->{$property} = false;
			$this->assertSame( EditorAccessResult::FORBIDDEN, EditorAccess::check( 4, $posts, $this->theme() )->state );
			$posts->{$property} = true;
		}
		$this->assertSame( EditorAccessResult::FORBIDDEN, EditorAccess::check( 0, $posts, $this->theme() )->state );
		$locked = EditorAccess::check( 4, $posts, $this->theme( false, 'too-new' ) );
		$this->assertSame( EditorAccessResult::THEME_LOCKED, $locked->state );
		$this->assertSame( 'too-new', $locked->lock_reason );
	}

	/** Bootstrap shape, title bound and hostile script content are safe. */
	public function test_bootstrap_contract_and_json_safety(): void {
		$title     = "Tom & Jerry's \"quote\" <b>x</b> \u{2028}" . \str_repeat( 'x', 240 );
		$bootstrap = EditorBootstrap::build(
			[
				'postTitle'     => $title,
				'contentLocale' => 'nl_NL',
				'editorLocale'  => 'en_US',
			]
		);
		$this->assertSame( [ 'version', 'restRoot', 'nonce', 'postId', 'postTitle', 'postType', 'contentLocale', 'defaultLocale', 'enabledLocales', 'editorLocale', 'pluginVersion', 'themeName', 'editingEnabled', 'lockReason', 'adminUrl', 'canvasUrl', 'viewUrl', 'cspNonce', 'contentLocaleExplicit' ], \array_keys( $bootstrap ) );
		$this->assertSame( 200, \mb_strlen( $bootstrap['postTitle'] ) );
		$this->assertSame( 'nl_NL', $bootstrap['contentLocale'] );
		$this->assertSame( 'en_US', $bootstrap['editorLocale'] );
		$this->assertStringStartsWith( 'Tom & Jerry\'s "quote" x ', $bootstrap['postTitle'] );
		$this->assertSame( 'Tom & Jerry’s', EditorBootstrap::build( [ 'postTitle' => 'Tom &amp; Jerry&#8217;s' ] )['postTitle'] );
		$bootstrap['themeName'] = "</script><!-- \u{2028}";
		$json                   = EditorBootstrap::to_script_json( $bootstrap );
		$this->assertStringNotContainsString( '</script>', \strtolower( $json ) );
		$this->assertStringContainsString( '\\u003C\\/script\\u003E', $json );
		$this->assertStringContainsString( '\\u2028', $json );
		$invalid = EditorBootstrap::build(
			[
				'contentLocale'  => 'bad!',
				'defaultLocale'  => 'en-US',
				'enabledLocales' => [ 'nl_NL', 'bad!', 'abcdefghi' ],
				'editorLocale'   => 'x',
			]
		);
		$this->assertSame( 'en_US', $invalid['contentLocale'] );
		$this->assertSame( 'en_US', $invalid['defaultLocale'] );
		$this->assertSame( [ 'nl_NL' ], $invalid['enabledLocales'] );
		$this->assertSame( 'en_US', $invalid['editorLocale'] );
	}

	/** Origins compare normalized scheme/host/port and ignore userinfo. */
	public function test_same_origin(): void {
		$this->assertTrue( EditorBootstrap::same_origin( 'https://user:secret@EXAMPLE.test/a', 'https://example.TEST/b' ) );
		$this->assertTrue( EditorBootstrap::same_origin( 'https://example.test:443/a', 'https://example.test/b' ) );
		$this->assertTrue( EditorBootstrap::same_origin( 'http://example.test:80/a', 'http://EXAMPLE.test/b' ) );
		$this->assertFalse( EditorBootstrap::same_origin( 'https://example.test:8443/a', 'https://example.test/b' ) );
		$this->assertFalse( EditorBootstrap::same_origin( 'http://example.test/a', 'https://example.test/a' ) );
		$this->assertFalse( EditorBootstrap::same_origin( 'https://example.test/a', 'https://other.test/a' ) );
		$this->assertFalse( EditorBootstrap::same_origin( '/relative', 'https://example.test/' ) );
	}

	/** Only admin.php is the isolated editor request endpoint. */
	public function test_editor_request_gate(): void {
		$this->assertTrue( EditorScreen::is_editor_admin_page( 'admin.php' ) );
		$this->assertFalse( EditorScreen::is_editor_admin_page( 'admin-ajax.php' ) );
		$this->assertFalse( EditorScreen::is_editor_admin_page( 'admin-post.php' ) );
	}

	/** A link that names an enabled locale is explicit; anything else falls back to the default and is not. */
	public function test_locale_is_explicit_only_when_the_link_names_an_enabled_locale(): void {
		$locales  = LocaleConfig::from_option(
			[
				'version'        => 1,
				'defaultLocale'  => 'en_US',
				'enabledLocales' => [ 'en_US', 'nl_NL' ],
			],
			'en_US'
		);
		$explicit = EditorRequest::parse(
			[
				'post'   => '5',
				'locale' => 'nl_NL',
			],
			$locales
		);
		$this->assertSame( [ 'nl_NL', true ], [ $explicit->content_locale, $explicit->locale_explicit ] );
		foreach ( [
			[ 'post' => '5' ],
			[
				'post'   => '5',
				'locale' => 'fr_FR',
			],
			[
				'post'   => '5',
				'locale' => '../x',
			],
			[
				'post'   => '5',
				'locale' => [ 'nl_NL' ],
			],
		] as $query ) {
			$fallback = EditorRequest::parse( $query, $locales );
			$this->assertSame( [ 'en_US', false ], [ $fallback->content_locale, $fallback->locale_explicit ] );
		}
		$this->assertFalse( EditorBootstrap::build( [ 'contentLocaleExplicit' => 'yes' ] )['contentLocaleExplicit'], 'only a real boolean true counts' );
		$this->assertTrue( EditorBootstrap::build( [ 'contentLocaleExplicit' => true ] )['contentLocaleExplicit'] );
	}

	/** Headers use the exact restrictive policy; only a per-response nonce (no inline allowance) opens style injection. */
	public function test_header_list(): void {
		$nonce   = 'AAAAAAAAAAAAAAAAAAAAAAAA';
		$headers = EditorHeaders::list( $nonce );
		$this->assertSame( "default-src 'none'; script-src 'self'; style-src 'self' 'nonce-AAAAAAAAAAAAAAAAAAAAAAAA'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'; object-src 'none'", $headers['Content-Security-Policy'] );
		$this->assertStringNotContainsString( 'unsafe-inline', $headers['Content-Security-Policy'] );
		$this->assertStringNotContainsString( 'unsafe-eval', $headers['Content-Security-Policy'] );
		$this->assertSame( 'private, no-store', $headers['Cache-Control'] );
		$canvas_headers = EditorHeaders::canvas_list( $nonce );
		$this->assertSame( "default-src 'none'; script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAAAA'; style-src 'self' 'nonce-AAAAAAAAAAAAAAAAAAAAAAAA'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'", $canvas_headers['Content-Security-Policy'] );
		$this->assertStringNotContainsString( "script-src 'self'", $canvas_headers['Content-Security-Policy'] );
		foreach ( [ $headers, $canvas_headers ] as $document_headers ) {
			$this->assertSame( 'SAMEORIGIN', $document_headers['X-Frame-Options'] );
			$this->assertSame( 'same-origin', $document_headers['Referrer-Policy'] );
		}
	}

	/** Nonces are random per response, well-formed, and a malformed one can never reach the header. */
	public function test_nonce(): void {
		$first  = EditorHeaders::new_nonce();
		$second = EditorHeaders::new_nonce();
		$this->assertNotSame( $first, $second );
		$this->assertTrue( EditorHeaders::is_valid_nonce( $first ) );
		$this->assertSame( 24, \strlen( $first ) );
		foreach ( [ '', 'short', \str_repeat( 'A', 65 ), "AAAAAAAAAAAAAAAA';script-src *", "AAAAAAAAAAAAAAAA\r\nX: y", 'AAAAAAAAAAAAAAAA AAAA' ] as $bad ) {
			$this->assertFalse( EditorHeaders::is_valid_nonce( $bad ), $bad );
			try {
				EditorHeaders::list( $bad );
				$this->fail( 'accepted ' . $bad );
			} catch ( \InvalidArgumentException $error ) {
				$this->assertSame( 'Invalid CSP nonce.', $error->getMessage() );
			}
		}
	}

	/** Row-action text and URL are escaped at output. */
	public function test_row_action_markup_escapes_hostile_values(): void {
		$this->assertSame( 'Edit with Blixis', EditorScreen::row_action_label( true, 'Edit with Blixis', 'View in Blixis (read-only)' ) );
		$this->assertSame( 'View in Blixis (read-only)', EditorScreen::row_action_label( false, 'Edit with Blixis', 'View in Blixis (read-only)' ) );
		$this->assertSame( '<a href="https://example.test/?a=1&amp;b=2">Edit &lt;Blixis&gt;</a>', EditorScreen::row_action_markup( 'https://example.test/?a=1&b=2', 'Edit <Blixis>' ) );
	}

	/** Asset manifest validation rejects missing, oversized, version, path and digest errors. */
	public function test_assets_manifest_validation(): void {
		$directory = \sys_get_temp_dir() . '/blixis-editor-' . \bin2hex( \random_bytes( 5 ) );
		\mkdir( $directory );
		$path = $directory . '/manifest.json';
		$this->assertNull( EditorAssets::from_manifest( $path, 'https://example.test/assets/editor' ) );
		$hash = \str_repeat( 'a', 64 );
		\file_put_contents( $directory . '/editor.js', 'bundle' );
		\file_put_contents( $directory . '/editor.css', 'bundle' );
		\file_put_contents( $directory . '/canvas.js', 'bundle' );
		\file_put_contents(
			$path,
			\json_encode(
				[
					'version'        => 1,
					'js'             => 'editor.js',
					'css'            => 'editor.css',
					'jsSha256'       => $hash,
					'cssSha256'      => $hash,
					'canvasJs'       => 'canvas.js',
					'canvasJsSha256' => $hash,
				]
			)
		);
		$this->assertSame(
			[
				'js_url'     => 'https://example.test/assets/editor/editor.js',
				'css_url'    => 'https://example.test/assets/editor/editor.css',
				'canvas_url' => 'https://example.test/assets/editor/canvas.js',
				'version'    => $hash . '.' . $hash . '.' . $hash,
			],
			EditorAssets::from_manifest( $path, 'https://example.test/assets/editor' )
		);
		foreach ( [ [ 'version' => 2 ], [ 'js' => '../editor.js' ], [ 'canvasJs' => 'other.js' ], [ 'cssSha256' => 'not-hex' ], [ 'canvasJsSha256' => 'NOT-HEX' ], [ 'extra' => true ], [ 'canvasJs' => null ] ] as $override ) {
			$valid = [
				'version'        => 1,
				'js'             => 'editor.js',
				'css'            => 'editor.css',
				'jsSha256'       => $hash,
				'cssSha256'      => $hash,
				'canvasJs'       => 'canvas.js',
				'canvasJsSha256' => $hash,
			];
			\file_put_contents( $path, \json_encode( \array_merge( $valid, $override ) ) );
			$this->assertNull( EditorAssets::from_manifest( $path, 'https://example.test/assets/editor' ) );
		}
		$missing = [
			'version'   => 1,
			'js'        => 'editor.js',
			'css'       => 'editor.css',
			'jsSha256'  => $hash,
			'cssSha256' => $hash,
			'canvasJs'  => 'canvas.js',
		];
		\file_put_contents( $path, \json_encode( $missing ) );
		$this->assertNull( EditorAssets::from_manifest( $path, 'https://example.test/assets/editor' ) );
		\file_put_contents( $path, \str_repeat( 'x', 4097 ) );
		$this->assertNull( EditorAssets::from_manifest( $path, 'https://example.test/assets/editor' ) );
		\unlink( $path );
		\unlink( $directory . '/editor.js' );
		\unlink( $directory . '/editor.css' );
		\unlink( $directory . '/canvas.js' );
		\rmdir( $directory );
	}
}
