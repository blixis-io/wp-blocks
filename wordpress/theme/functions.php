<?php
/**
 * Blixis theme bootstrap.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/src/Compat.php';
require_once __DIR__ . '/src/Setup.php';
require_once __DIR__ . '/src/Appearance.php';
require_once __DIR__ . '/src/AppearanceToggle.php';
require_once __DIR__ . '/src/SetupState.php';
require_once __DIR__ . '/src/TokenDraft.php';
require_once __DIR__ . '/src/FontLibrary.php';
require_once __DIR__ . '/src/DesignSystemStore.php';
require_once __DIR__ . '/src/SetupChoices.php';
require_once __DIR__ . '/src/SetupTemplates.php';
require_once __DIR__ . '/src/SetupAdmin.php';

Setup::register();
