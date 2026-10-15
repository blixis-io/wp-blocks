<?php
/**
 * Theme guard and read-only status tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Frontend\FallbackCss;
use Blixis\Builder\Rest\FakePostAccess;
use Blixis\Builder\Rest\DocumentResult;
use Blixis\Builder\Rest\StatusRequest;
use Blixis\Builder\Rest\ThemeGuard;
use Blixis\Builder\Theme\CompatibilityReader;
use Blixis\Builder\Theme\ThemeCompat;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
require_once __DIR__ . '/FakePostAccess.php';
Autoloader::register();

/** Checks lock ordering, read access, and static CSS. */
final class ThemeGuardTest extends TestCase {
	/** Construct a fake theme.
	 *
	 * @param ?int $version Declared contract.
	 * @param bool $invalid Whether the header is malformed.
	 */
	private function compat( ?int $version = null, bool $invalid = true ): ThemeCompat {
		ThemeCompat::reset_for_tests();
		$reader = new class( $version, $invalid ) implements CompatibilityReader {
			/** Fixture values.
			 *
			 * @param ?int $version Declared contract.
			 * @param bool $invalid Header invalidity.
			 */
			public function __construct( private ?int $version, private bool $invalid ) {}
			/** Fixture context. */
			public function context_key(): string {
				return 'theme-guard';
			}
			/** Version absent. */
			public function declared(): ?int {
				return $this->version;
			}
			/** Header malformed. */
			public function invalid_declaration(): bool {
				return $this->invalid;
			}
			/** Fixture name. */
			public function active_theme_name(): string {
				return 'Fixture';
			}
		};
		return new ThemeCompat( $reader );
	}

	/** Every incompatibility reason produces the same lock contract. */
	public function test_lock_reasons(): void {
		foreach ( [ [ null, false, 'not-declared' ], [ null, true, 'invalid-declaration' ], [ 0, false, 'too-old' ], [ 2, false, 'too-new' ] ] as [ $version, $invalid, $reason ] ) {
			$access = new FakePostAccess();
			$result = ( new ThemeGuard( $access, $this->compat( $version, $invalid ) ) )->permission( 5, true );
			$this->assertInstanceOf( DocumentResult::class, $result );
			$this->assertSame( 423, $result->status );
			$this->assertSame( $reason, $result->body['reason'] );
		}
	}

	/** Changing routes lock, and reads remain available. */
	public function test_guard_routes_and_order(): void {
		$access = new FakePostAccess();
		$guard  = new ThemeGuard( $access, $this->compat() );
		foreach ( [ 'layout PUT', 'content PUT', 'layout restore', 'content restore', 'publish', 'rollback' ] as $route ) {
			$result = $guard->permission( 5, true, \in_array( $route, [ 'publish', 'rollback' ], true ) );
			$this->assertInstanceOf( DocumentResult::class, $result );
			$this->assertSame( 423, $result->status, $route );
			$this->assertSame( 'blixis_theme_incompatible', $result->error_code );
			$this->assertSame(
				[
					'reason'       => 'invalid-declaration',
					'theme'        => 'Fixture',
					'declared'     => null,
					'supportedMin' => 1,
					'supportedMax' => 1,
				],
				$result->body
			);
		}
		foreach ( [ 'document GET', 'revisions', 'published state', 'preview', 'media GET' ] as $route ) {
			$this->assertNull( $guard->permission( 5 ), $route );
		}
		$access->authenticated = false;
		$result                = $guard->permission( 5, true );
		$this->assertInstanceOf( DocumentResult::class, $result );
		$this->assertSame( 401, $result->status );
		$access->authenticated = true;
		$access->can_edit      = false;
		$result                = $guard->permission( 5, true );
		$this->assertInstanceOf( DocumentResult::class, $result );
		$this->assertSame( 403, $result->status );
		$access->can_edit    = true;
		$access->can_publish = false;
		$result              = $guard->permission( 5, true, true );
		$this->assertInstanceOf( DocumentResult::class, $result );
		$this->assertSame( 403, $result->status );
	}

	/** Status requires edit_posts and is shaped for the client. */
	public function test_status_policy(): void {
		$request = new StatusRequest( $this->compat() );
		$this->assertSame( 401, $request->permission( false, false )?->status );
		$this->assertSame( 403, $request->permission( true, false )?->status );
		$this->assertNull( $request->permission( true, true ) );
		$this->assertSame( 'invalid-declaration', $request->status()['editing']['lockReason'] );
		$this->assertFalse( $request->status()['editing']['enabled'] );
	}

	/** Fallback CSS is stable and does not contain markup or unapproved variables. */
	public function test_fallback_css(): void {
		$css = FallbackCss::css();
		$this->assertSame( $css, FallbackCss::css() );
		$this->assertSame( '06cc67e8c6be20e1701e2119d50fb106786ef55abc356545aac05246bfbd368b', \hash( 'sha256', $css ) );
		$this->assertStringNotContainsString( '<', $css );
		$this->assertStringContainsString( '@layer blx.theme', $css );
		\preg_match_all( '/--blx-[a-z]+(?:-[a-z0-9]+)*/', $css, $matches );
		$this->assertSame( [], \array_diff( $matches[0], [ '--blx-space-4', '--blx-container-content', '--blx-container-wide', '--blx-space-2', '--blx-radius-sm', '--blx-color-primary', '--blx-color-on-primary' ] ) );
	}
}
