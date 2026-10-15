<?php
/**
 * Isolated theme compatibility contract tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Theme\CompatibilityReader;
use Blixis\Builder\Theme\ThemeCompat;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
require_once __DIR__ . '/CountingCompatibilityReader.php';
Autoloader::register();
/** Parser and reason policy. */
final class ThemeCompatTest extends TestCase {
	/** Header parser cases.
	 *
	 * @return array<string, array{string, ?int}>
	 */
	public static function values(): array {
		return [
			'one'          => [ '1', 1 ],
			'max'          => [ '9999', 9999 ],
			'spaces'       => [ " 1\t", 1 ],
			'empty'        => [ '', null ],
			'zero'         => [ '0', null ],
			'leading zero' => [ '01', null ],
			'plus'         => [ '+1', null ],
			'inside space' => [ '1 2', null ],
			'large'        => [ '10000', null ],
			'decimal'      => [ '1.0', null ],
			'text'         => [ 'abc', null ],
			'unicode'      => [ '١', null ],
			'huge'         => [ '99999999999999999999', null ],
		];
	}
	/** Test header parsing.
	 *
	 * @param string $raw Header.
	 * @param ?int   $expected Expected version.
	 */
	#[DataProvider( 'values' )]
	public function test_parse( string $raw, ?int $expected ): void {
		$this->assertSame( $expected, ThemeCompat::parse( $raw ) );
	}
	/** A declared child wins even when the header is empty or invalid. */
	public function test_child_precedence(): void {
		$this->assertSame( '1', ThemeCompat::effective_header( '', false, '1' ) );
		$this->assertSame( '2', ThemeCompat::effective_header( '2', true, '1' ) );
		$this->assertSame( 'x', ThemeCompat::effective_header( 'x', true, '1' ) );
		$this->assertSame( '', ThemeCompat::effective_header( '', true, '1' ) );
		$this->assertFalse( ThemeCompat::header_present( 'Theme Name: Child' ) );
		$this->assertTrue( ThemeCompat::header_present( "Theme Name: Child\nBlixis-Compat: " ) );
		$this->assertTrue( ThemeCompat::header_present( "Theme Name: Child\nBlixis-Compat: x" ) );
		$this->assertTrue( ThemeCompat::header_present( "/*\n * Blixis-Compat: 1\n */" ) );
	}
	/** Status reason cases.
	 *
	 * @return array<string, array{?int, bool, string}>
	 */
	public static function reasons(): array {
		return [
			'ok'      => [ 1, false, 'ok' ],
			'old'     => [ 0, false, 'too-old' ],
			'absent'  => [ null, false, 'not-declared' ],
			'invalid' => [ null, true, 'invalid-declaration' ],
			'new'     => [ 2, false, 'too-new' ],
		];
	}
	/** Test compatibility reasons.
	 *
	 * @param ?int   $version Declared version.
	 * @param bool   $invalid Invalid header state.
	 * @param string $reason Expected reason.
	 */
	#[DataProvider( 'reasons' )]
	public function test_status( ?int $version, bool $invalid, string $reason ): void {
		ThemeCompat::reset_for_tests();
		$reader = new class( $version, $invalid ) implements CompatibilityReader {
			/** Create a fake reader.
			 *
			 * @param ?int $version Version.
			 * @param bool $invalid Invalid state.
			 */
			public function __construct( private ?int $version, private bool $invalid ) {}
			/** Fixture context. */
			public function context_key(): string {
				return 'theme-status';
			}
			/** Implement the compatibility reader contract. */
			public function declared(): ?int {
				return $this->version; }
			/** Implement the compatibility reader contract. */
			public function invalid_declaration(): bool {
				return $this->invalid; }
			/** Implement the compatibility reader contract. */
			public function active_theme_name(): string {
				return 'Fixture'; }
		};
		$status = ( new ThemeCompat( $reader ) )->status();
		$this->assertSame( $reason, $status->reason );
		$this->assertSame( 'ok' === $reason, $status->compatible );
		$this->assertSame( $version, $status->declared );
	}
	/** A repeated context reuses the same result across service instances. */
	public function test_same_context_reuses_status(): void {
		ThemeCompat::reset_for_tests();
		$reader          = new CountingCompatibilityReader();
		$first           = ( new ThemeCompat( $reader ) )->status();
		$reader->version = 2;
		$this->assertSame( $first, ( new ThemeCompat( $reader ) )->status() );
		$this->assertSame( 1, $reader->reads );
	}
	/** A new blog or theme context must read its own declaration. */
	public function test_different_context_recomputes_status(): void {
		ThemeCompat::reset_for_tests();
		$reader = new CountingCompatibilityReader();
		$compat = new ThemeCompat( $reader );
		$this->assertSame( 'ok', $compat->status()->reason );
		$reader->key     = 'blog-2|theme|parent';
		$reader->version = 2;
		$this->assertSame( 'too-new', $compat->status()->reason );
		$this->assertSame( 2, $reader->reads );
	}
	/** The oldest context is evicted after eight cached results. */
	public function test_cache_is_bounded(): void {
		ThemeCompat::reset_for_tests();
		$reader = new CountingCompatibilityReader();
		$compat = new ThemeCompat( $reader );
		for ( $index = 0; $index < 9; ++$index ) {
			$reader->key = 'context-' . $index;
			$compat->status();
		}
		$reader->key = 'context-1';
		$compat->status();
		$this->assertSame( 9, $reader->reads );
		$reader->key = 'context-0';
		$compat->status();
		$this->assertSame( 10, $reader->reads );
	}
}
