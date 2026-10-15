<?php
/**
 * Admin notice escaping in isolation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Theme\AdminNotice;
use PHPUnit\Framework\TestCase;
if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once __DIR__ . '/AdminNoticeWordPressStubs.php';
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();
/** The active theme cannot inject markup into the notice. */
final class AdminNoticeTest extends TestCase {
	/** Escape script tags, quotes and the target URL. */
	public function test_escaped_theme_name(): void {
		$html = AdminNotice::html( '<script>"bad"</script>', '/wp-admin/themes.php?x="' );
		$this->assertStringContainsString( '&lt;script&gt;&quot;bad&quot;&lt;/script&gt;', $html );
		$this->assertStringNotContainsString( '<script>', $html );
		$this->assertStringContainsString( 'href="/wp-admin/themes.php?x=&quot;"', $html );
	}
}
